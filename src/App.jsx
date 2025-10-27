import React, { useState, useMemo } from 'react';
import { Upload, Download, BarChart3, Table2, Settings } from 'lucide-react';
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
      
      // 날짜 필드 자동 감지
      const detectedDateFields = [];
      const firstRow = trimmedData[0] || {};
      
      Object.keys(firstRow).forEach(key => {
        const value = String(firstRow[key]);
        // 날짜 패턴 감지: YYYY/MM/DD, YYYY-MM-DD 등
        if (value.match(/^\d{4}[/-]\d{1,2}[/-]\d{1,2}/)) {
          detectedDateFields.push(key);
        }
      });
      
      setData(trimmedData);
      const cols = Object.keys(trimmedData[0] || {});
      setColumns(cols);
      setDateFields(detectedDateFields);
      
      // 날짜 필드 기본값 설정
      const defaultGrouping = {};
      detectedDateFields.forEach(field => {
        defaultGrouping[field] = 'daily'; // 기본값: 일별
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
    
    // 날짜 파싱
    const match = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) return value || '(공백)';
    
    const [, year, month, day] = match;
    
    if (grouping === 'monthly') {
      return `${year}-${month.padStart(2, '0')}`; // 2025-09
    } else {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`; // 2025-09-27
    }
  };

  const isDateInRange = (dateValue) => {
    if (!filterEnabled || !startDate || !endDate) return true;
    
    const dateStr = String(dateValue);
    // 슬래시(/)와 하이픈(-) 모두 지원
    const match = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) return true;
    
    const [, year, month, day] = match;
    // 하이픈 형식으로 통일
    const itemDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    
    return itemDate >= startDate && itemDate <= endDate;
  };

  const filteredData = useMemo(() => {
    if (!filterEnabled || !startDate || !endDate || dateFields.length === 0) {
      return data;
    }
    
    const filtered = data.filter(row => {
      // 날짜 필드 중 하나라도 범위 안에 있으면 포함
      return dateFields.some(field => {
        const value = row[field];
        if (!value) return false;
        return isDateInRange(value);
      });
    });
    
    console.log('필터링 결과:', filtered.length, '개 행');
    return filtered;
  }, [data, filterEnabled, startDate, endDate, dateFields]);

  const pivotData = useMemo(() => {
    if (!filteredData.length || !rowFields.length) return null;

    const grouped = {};
    
    // 기간 필터 적용 시 날짜 필드 제외
    const activeRowFields = filterEnabled && startDate && endDate
      ? rowFields.filter(field => !dateFields.includes(field))
      : rowFields;
    
    const activeColumnFields = filterEnabled && startDate && endDate
      ? columnFields.filter(field => !dateFields.includes(field))
      : columnFields;
    
    // 필터 적용했는데 날짜 필드만 선택된 경우
    if (activeRowFields.length === 0 && activeColumnFields.length === 0 && (rowFields.length > 0 || columnFields.length > 0)) {
      return null;
    }
    
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

  const calculateValue = (items) => {
    if (!items || items.length === 0) return 0;
    
    switch(aggregation) {
      case 'COUNT':
        return items.length;
      case 'UNIQUE':
        if (!uniqueField) return 0;
        const uniqueValues = new Set(items.map(item => item[uniqueField]));
        return uniqueValues.size;
      case 'SUM':
        return items.reduce((sum, item) => {
          const val = parseFloat(item[valueField]);
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
      case 'AVG':
        const sum = items.reduce((s, item) => {
          const val = parseFloat(item[valueField]);
          return s + (isNaN(val) ? 0 : val);
        }, 0);
        return (sum / items.length).toFixed(2);
      case 'MAX':
        return Math.max(...items.map(item => parseFloat(item[valueField]) || 0));
      case 'MIN':
        return Math.min(...items.map(item => parseFloat(item[valueField]) || 0));
      default:
        return items.length;
    }
  };

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
  };

  const exportToExcel = () => {
    if (!pivotData) return;
    
    const ws_data = [
      ['', ...pivotData.columns],
      ...pivotData.rows.map(row => [
        row,
        ...pivotData.columns.map(col => 
          calculateValue(pivotData.data[row][col])
        )
      ])
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "피벗테이블");
    XLSX.writeFile(wb, "pivot_result.xlsx");
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
                  <h1>피벗 테이블 분석기</h1>
                  <p className="subtitle">데이터를 자유롭게 분석하세요</p>
                </div>
              </div>
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
                    
                    <div className="config-box date-grouping" style={{gridColumn: '1 / -1', background: '#fef3c7'}}>
                      <h3 style={{color: '#78350f'}}>📅 날짜 그룹핑</h3>
                      {filterEnabled && startDate && endDate && (
                        <div style={{marginBottom: '1rem', padding: '0.75rem', background: '#fef9c3', border: '2px solid #facc15', borderRadius: '0.5rem', fontSize: '0.9rem'}}>
                          💡 <strong>안내:</strong> 필터링된 기간 ({startDate} ~ {endDate}) 내에서 그룹핑됩니다
                        </div>
                      )}
                      <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap'}}>
                        {dateFields.map(field => (
                          <div key={field} style={{flex: '1', minWidth: '200px'}}>
                            <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '600'}}>
                              {field}
                            </label>
                            <select
                              value={dateGrouping[field] || 'daily'}
                              onChange={(e) => setDateGrouping(prev => ({...prev, [field]: e.target.value}))}
                              className="select"
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
              </div>
            )}

            {pivotData && (
              <div className="result-section">
                <div className="result-header">
                  <h2>피벗 테이블 결과</h2>
                  <button onClick={exportToExcel} className="export-btn">
                    <Download size={18} />
                    Excel 내보내기
                  </button>
                </div>
                
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th className="sticky-col">
                          {rowFields.join(' / ')}
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
                              {calculateValue(pivotData.data[row][col])}
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