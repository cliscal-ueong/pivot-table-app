import React, { useState, useMemo } from 'react';
import { Upload, Download, BarChart3, Table2, Settings, Plus, Trash2 } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [rowFields, setRowFields] = useState([]);
  const [columnFields, setColumnFields] = useState([]);
  const [valueField, setValueField] = useState('');
  const [aggregation, setAggregation] = useState('COUNT');
  const [uniqueField, setUniqueField] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [dateFields, setDateFields] = useState([]);
  const [dateGrouping, setDateGrouping] = useState({});
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterEnabled, setFilterEnabled] = useState(false);
  
  const [metrics, setMetrics] = useState([
    { id: 1, field: '', calculation: 'COUNT', uniqueField: '' }
  ]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    const processData = (jsonData) => {
      const trimmedData = jsonData.map(row => {
        const trimmedRow = {};
        Object.keys(row).forEach(key => {
          trimmedRow[key.trim()] = row[key];
        });
        return trimmedRow;
      });
      
      const detectedDateFields = [];
      const firstRow = trimmedData[0] || {};
      
      Object.keys(firstRow).forEach(key => {
        const value = String(firstRow[key]);
        if (value.match(/^\d{4}[/-]\d{1,2}[/-]\d{1,2}/)) {
          detectedDateFields.push(key);
        }
      });
      
      setData(trimmedData);
      const cols = Object.keys(trimmedData[0] || {});
      setColumns(cols);
      setDateFields(detectedDateFields);
      
      const defaultGrouping = {};
      detectedDateFields.forEach(field => {
        defaultGrouping[field] = 'daily';
      });
      setDateGrouping(defaultGrouping);
    };
    
    if (file.name.endsWith('.csv')) {
      reader.onload = (event) => {
        Papa.parse(event.target.result, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            processData(results.data);
          }
        });
      };
      reader.readAsText(file);
    } else {
      reader.onload = (event) => {
        const workbook = XLSX.read(event.target.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        processData(jsonData);
      };
      reader.readAsBinaryString(file);
    }
  };

  const formatDateValue = (value, field) => {
    if (!dateFields.includes(field)) return value || '(공백)';
    
    const grouping = dateGrouping[field] || 'daily';
    const dateStr = String(value);
    
    const match = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) return value || '(공백)';
    
    const [, year, month, day] = match;
    
    if (grouping === 'monthly') {
      return `${year}-${month.padStart(2, '0')}`;
    } else {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  };

  const isDateInRange = (dateValue) => {
    if (!filterEnabled || !startDate || !endDate) return true;
    
    const dateStr = String(dateValue);
    const match = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) return true;
    
    const [, year, month, day] = match;
    const itemDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    
    return itemDate >= startDate && itemDate <= endDate;
  };

  const filteredData = useMemo(() => {
    if (!filterEnabled || !startDate || !endDate || dateFields.length === 0) {
      return data;
    }
    
    const filtered = data.filter(row => {
      return dateFields.some(field => {
        const value = row[field];
        if (!value) return false;
        return isDateInRange(value);
      });
    });
    
    return filtered;
  }, [data, filterEnabled, startDate, endDate, dateFields]);

  const pivotData = useMemo(() => {
    if (!filteredData.length || !rowFields.length) return null;

    const grouped = {};
    
    const activeRowFields = filterEnabled && startDate && endDate
      ? rowFields.filter(field => !dateFields.includes(field))
      : rowFields;
    
    const activeColumnFields = filterEnabled && startDate && endDate
      ? columnFields.filter(field => !dateFields.includes(field))
      : columnFields;
    
    if (activeRowFields.length === 0) return null;
    
    filteredData.forEach(row => {
      const rowKey = activeRowFields.map(field => formatDateValue(row[field], field)).join(' | ');
      const colKey = activeColumnFields.length 
        ? activeColumnFields.map(field => formatDateValue(row[field], field)).join(' | ')
        : 'Total';
      
      if (!grouped[rowKey]) grouped[rowKey] = {};
      if (!grouped[rowKey][colKey]) grouped[rowKey][colKey] = [];
      
      grouped[rowKey][colKey].push(row);
    });

    const colHeaders = new Set();
    Object.values(grouped).forEach(rowData => {
      Object.keys(rowData).forEach(col => colHeaders.add(col));
    });

    const result = {
      rows: Object.keys(grouped).sort(),
      columns: Array.from(colHeaders).sort(),
      data: grouped
    };

    return result;
  }, [filteredData, rowFields, columnFields, dateGrouping, filterEnabled, startDate, endDate, dateFields]);

  const calculateValue = (items, calculation, field, uniqueField) => {
    if (!items || items.length === 0) return 0;
    
    switch(calculation) {
      case 'COUNT':
        return items.length;
      case 'UNIQUE':
        if (!uniqueField) return 0;
        const uniqueValues = new Set(items.map(item => item[uniqueField]));
        return uniqueValues.size;
      case 'SUM':
        return items.reduce((sum, item) => {
          const val = parseFloat(item[field]);
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
      case 'AVG':
        const sum = items.reduce((s, item) => {
          const val = parseFloat(item[field]);
          return s + (isNaN(val) ? 0 : val);
        }, 0);
        return (sum / items.length).toFixed(2);
      case 'MAX':
        return Math.max(...items.map(item => parseFloat(item[field]) || 0));
      case 'MIN':
        return Math.min(...items.map(item => parseFloat(item[field]) || 0));
      default:
        return items.length;
    }
  };

  const periodMetrics = useMemo(() => {
    if (!filterEnabled || !startDate || !endDate || !filteredData.length) return null;
    
    return metrics.map(metric => {
      const value = calculateValue(filteredData, metric.calculation, metric.field, metric.uniqueField);
      return {
        ...metric,
        value
      };
    });
  }, [filteredData, metrics, filterEnabled, startDate, endDate]);

  const toggleField = (field, type) => {
    if (type === 'row') {
      setRowFields(prev => 
        prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
      );
    } else {
      setColumnFields(prev => 
        prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
      );
    }
  };

  const resetAllSettings = () => {
    setRowFields([]);
    setColumnFields([]);
    setValueField('');
    setAggregation('COUNT');
    setUniqueField('');
    setStartDate('');
    setEndDate('');
    setFilterEnabled(false);
    setMetrics([{ id: 1, field: '', calculation: 'COUNT', uniqueField: '' }]);
  };

  const addMetric = () => {
    const newId = Math.max(...metrics.map(m => m.id), 0) + 1;
    setMetrics([...metrics, { id: newId, field: '', calculation: 'COUNT', uniqueField: '' }]);
  };

  const removeMetric = (id) => {
    if (metrics.length > 1) {
      setMetrics(metrics.filter(m => m.id !== id));
    }
  };

  const updateMetric = (id, updates) => {
    setMetrics(metrics.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const exportToExcel = () => {
    if (periodMetrics) {
      const ws_data = [
        ['측정 항목', '계산 방식', '결과'],
        ...periodMetrics.map(m => [
          m.calculation === 'UNIQUE' ? m.uniqueField : m.field,
          m.calculation === 'COUNT' ? '개수' :
          m.calculation === 'UNIQUE' ? '유니크 개수' :
          m.calculation === 'SUM' ? '합계' :
          m.calculation === 'AVG' ? '평균' :
          m.calculation === 'MAX' ? '최대값' : '최소값',
          m.value
        ])
      ];
      
      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "기간별 집계");
      XLSX.writeFile(wb, `period_metrics_${startDate}_${endDate}.xlsx`);
    } else if (pivotData) {
      const ws_data = [
        ['', ...pivotData.columns],
        ...pivotData.rows.map(row => [
          row,
          ...pivotData.columns.map(col => 
            calculateValue(pivotData.data[row][col], aggregation, valueField, uniqueField)
          )
        ])
      ];
      
      const ws = XLSX.utils.aoa_to_sheet(ws_data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "피벗테이블");
      XLSX.writeFile(wb, "pivot_result.xlsx");
    }
  };

  return (
    <div className="app">
      <div className="container">
        <div className="card">
          <div className="header">
            <div className="header-content">
              <div className="header-left">
                <BarChart3 size={32} />
                <div>
                  <h1>매출 데이터 분석 Tool_by. MGT</h1>
                  <p className="subtitle">데이터를 자유롭게 분석하세요</p>
                </div>
              </div>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="config-btn"
                >
                  <Settings size={20} />
                  {showConfig ? '설정 숨기기' : '설정 보기'}
                </button>
                <button
                  onClick={resetAllSettings}
                  className="config-btn"
                  style={{background: 'rgba(239, 68, 68, 0.2)'}}
                >
                  🔄 초기화
                </button>
              </div>
            </div>
          </div>

          <div className="content">
            <div className="upload-area">
              <label className="upload-label">
                <div className="upload-content">
                  <Upload size={32} />
                  <span>CSV 또는 Excel 파일을 업로드하세요</span>
                  {data.length > 0 && (
                    <div className="upload-success">
                      ✓ {data.length}개 행 로드됨
                    </div>
                  )}
                </div>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {showConfig && columns.length > 0 && (
              <div className="config-grid">
                {dateFields.length > 0 && (
                  <>
                    <div className="config-box date-filter" style={{gridColumn: '1 / -1', background: '#dbeafe'}}>
                      <h3 style={{color: '#1e40af'}}>📅 기간 필터 (선택사항)</h3>
                      <div style={{display: 'flex', gap: '1rem', alignItems: 'end', flexWrap: 'wrap'}}>
                        <div style={{flex: '1', minWidth: '150px'}}>
                          <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem'}}>
                            시작일
                          </label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="select"
                          />
                        </div>
                        <div style={{flex: '1', minWidth: '150px'}}>
                          <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem'}}>
                            종료일
                          </label>
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="select"
                          />
                        </div>
                        <div style={{display: 'flex', gap: '0.5rem'}}>
                          <button
                            onClick={() => setFilterEnabled(true)}
                            disabled={!startDate || !endDate}
                            style={{
                              padding: '0.75rem 1.5rem',
                              background: (startDate && endDate) ? '#3b82f6' : '#94a3b8',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.5rem',
                              cursor: (startDate && endDate) ? 'pointer' : 'not-allowed',
                              fontWeight: '600'
                            }}
                          >
                            필터 적용
                          </button>
                          <button
                            onClick={() => {
                              setFilterEnabled(false);
                              setStartDate('');
                              setEndDate('');
                            }}
                            style={{
                              padding: '0.75rem 1.5rem',
                              background: '#64748b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.5rem',
                              cursor: 'pointer',
                              fontWeight: '600'
                            }}
                          >
                            전체 보기
                          </button>
                        </div>
                      </div>
                      {filterEnabled && startDate && endDate && (
                        <div style={{marginTop: '1rem', padding: '0.75rem', background: '#3b82f6', color: 'white', borderRadius: '0.5rem', fontWeight: '600'}}>
                          ✓ 필터 적용 중: {startDate} ~ {endDate} ({filteredData.length}개 행)
                        </div>
                      )}
                    </div>

                    {filterEnabled && startDate && endDate && (
                      <div className="config-box" style={{gridColumn: '1 / -1', background: '#f0fdf4', border: '2px solid #22c55e'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                          <h3 style={{color: '#166534', margin: 0}}>📊 측정 항목</h3>
                          <button
                            onClick={addMetric}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.5rem 1rem',
                              background: '#22c55e',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.5rem',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '0.9rem'
                            }}
                          >
                            <Plus size={16} />
                            측정 항목 추가
                          </button>
                        </div>
                        
                        {metrics.map((metric, index) => (
                          <div key={metric.id} style={{
                            display: 'flex',
                            gap: '0.5rem',
                            marginBottom: '0.75rem',
                            alignItems: 'end',
                            padding: '1rem',
                            background: 'white',
                            borderRadius: '0.5rem',
                            border: '1px solid #bbf7d0'
                          }}>
                            <div style={{flex: 1}}>
                              <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.85rem'}}>
                                측정 항목
                              </label>
                              <select
                                value={metric.calculation === 'UNIQUE' ? metric.uniqueField : metric.field}
                                onChange={(e) => {
                                  if (metric.calculation === 'UNIQUE') {
                                    updateMetric(metric.id, { uniqueField: e.target.value });
                                  } else {
                                    updateMetric(metric.id, { field: e.target.value });
                                  }
                                }}
                                className="select"
                                style={{fontSize: '0.9rem'}}
                              >
                                <option value="">선택하세요</option>
                                {columns.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div style={{flex: 1}}>
                              <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.85rem'}}>
                                계산 방식
                              </label>
                              <select
                                value={metric.calculation}
                                onChange={(e) => updateMetric(metric.id, { calculation: e.target.value })}
                                className="select"
                                style={{fontSize: '0.9rem'}}
                              >
                                <option value="COUNT">개수</option>
                                <option value="UNIQUE">유니크 개수</option>
                                <option value="SUM">합계</option>
                                <option value="AVG">평균</option>
                                <option value="MAX">최대값</option>
                                <option value="MIN">최소값</option>
                              </select>
                            </div>
                            
                            {metrics.length > 1 && (
                              <button
                                onClick={() => removeMetric(metric.id)}
                                style={{
                                  padding: '0.75rem',
                                  background: '#ef4444',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '0.5rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center'
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="config-box date-grouping" style={{gridColumn: '1 / -1', background: '#fef3c7', opacity: filterEnabled ? 0.5 : 1}}>
                      <h3 style={{color: '#78350f'}}>📅 날짜 그룹핑</h3>
                      {filterEnabled && startDate && endDate && (
                        <div style={{marginBottom: '1rem', padding: '0.75rem', background: '#fef9c3', border: '2px solid #facc15', borderRadius: '0.5rem', fontSize: '0.9rem'}}>
                          💡 <strong>안내:</strong> 기간 필터 적용 중에는 날짜 그룹핑이 비활성화됩니다
                        </div>
                      )}
                      <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', pointerEvents: filterEnabled ? 'none' : 'auto'}}>
                        {dateFields.map(field => (
                          <div key={field} style={{flex: '1', minWidth: '200px'}}>
                            <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '600'}}>
                              {field}
                            </label>
                            <select
                              value={dateGrouping[field] || 'daily'}
                              onChange={(e) => setDateGrouping(prev => ({...prev, [field]: e.target.value}))}
                              className="select"
                              disabled={filterEnabled}
                            >
                              <option value="daily">일별</option>
                              <option value="monthly">월별</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                
                {(!filterEnabled || !startDate || !endDate) && (
                  <>
                    <div className="config-box row-fields">
                      <h3>
                        <Table2 size={20} />
                        그룹으로 묶을 항목 (세로)
                      </h3>
                      <div className="field-list">
                        {columns.map(col => (
                          <button
                            key={col}
                            onClick={() => toggleField(col, 'row')}
                            className={`field-btn ${rowFields.includes(col) ? 'active' : ''}`}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="config-box column-fields">
                      <h3>
                        <Table2 size={20} />
                        비교할 항목 (가로) - 선택사항
                      </h3>
                      <div className="field-list">
                        {columns.map(col => (
                          <button
                            key={col}
                            onClick={() => toggleField(col, 'column')}
                            className={`field-btn ${columnFields.includes(col) ? 'active' : ''}`}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="config-box value-field">
                      <h3>무엇을 셀까요?</h3>
                      <select
                        value={valueField}
                        onChange={(e) => setValueField(e.target.value)}
                        className="select"
                      >
                        <option value="">선택하세요</option>
                        {columns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>

                    <div className="config-box aggregation">
                      <h3>어떻게 계산할까요?</h3>
                      <select
                        value={aggregation}
                        onChange={(e) => setAggregation(e.target.value)}
                        className="select"
                      >
                        <option value="COUNT">개수</option>
                        <option value="UNIQUE">유니크 개수</option>
                        <option value="SUM">합계</option>
                        <option value="AVG">평균</option>
                        <option value="MAX">최대값</option>
                        <option value="MIN">최소값</option>
                      </select>
                      
                      {aggregation === 'UNIQUE' && (
                        <div style={{marginTop: '1rem'}}>
                          <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem'}}>
                            어떤 필드를 유니크로 셀까요?
                          </label>
                          <select
                            value={uniqueField}
                            onChange={(e) => setUniqueField(e.target.value)}
                            className="select"
                          >
                            <option value="">선택하세요</option>
                            {columns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {periodMetrics && (
              <div style={{marginTop: '2rem'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                  <h2 style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937'}}>
                    📊 기간별 측정 결과 ({startDate} ~ {endDate})
                  </h2>
                  <button
                    onClick={exportToExcel}
                    className="export-btn"
                  >
                    <Download size={18} />
                    Excel 내보내기
                  </button>
                </div>
                
                <div className="table-container">
                  <table>
                    <thead>
                      <tr style={{background: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)'}}>
                        <th style={{textAlign: 'left'}}>측정 항목</th>
                        <th style={{textAlign: 'left'}}>계산 방식</th>
                        <th style={{textAlign: 'right'}}>결과</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodMetrics.map((metric, idx) => (
                        <tr key={metric.id} className={idx % 2 === 0 ? 'even' : 'odd'}>
                          <td style={{fontWeight: '600'}}>
                            {metric.calculation === 'UNIQUE' ? metric.uniqueField : metric.field}
                          </td>
                          <td>
                            {metric.calculation === 'COUNT' ? '개수' :
                             metric.calculation === 'UNIQUE' ? '유니크 개수' :
                             metric.calculation === 'SUM' ? '합계' :
                             metric.calculation === 'AVG' ? '평균' :
                             metric.calculation === 'MAX' ? '최대값' : '최소값'}
                          </td>
                          <td style={{textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem'}}>
                            {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {pivotData && !periodMetrics && (
              <div style={{marginTop: '2rem'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                  <h2 style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937'}}>피벗 테이블 결과</h2>
                  <button
                    onClick={exportToExcel}
                    className="export-btn"
                  >
                    <Download size={18} />
                    Excel 내보내기
                  </button>
                </div>
                
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th className="sticky-col">
                          {rowFields.filter(f => !dateFields.includes(f) || !filterEnabled).join(' / ')}
                        </th>
                        {pivotData.columns.map(col => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pivotData.rows.map((row, idx) => (
                        <tr key={row} className={idx % 2 === 0 ? 'even' : 'odd'}>
                          <td className="sticky-col">{row}</td>
                          {pivotData.columns.map(col => (
                            <td key={col}>
                              {calculateValue(pivotData.data[row][col], aggregation, valueField, uniqueField)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!data.length && (
              <div className="empty-state">
                <BarChart3 size={64} />
                <p>파일을 업로드하여 시작하세요</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;