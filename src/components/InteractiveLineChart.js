import React, { useMemo, useRef, useState } from 'react';
import styles from '../pages/dashboard.module.css';

const CHART_W = 900;
const CHART_H = 300;
const PAD_TOP = 20;
const PAD_RIGHT = 54;
const PAD_BOTTOM = 46;
const PAD_LEFT = 56;

const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toChartValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const defaultValueFormat = (value) => `${toNum(value).toFixed(1)}`;
const defaultDateFormat = (date) => `${date || ''}`;

const buildLinearPath = (points) => points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

const buildSmoothPath = (points) => {
  if (points.length < 3) return buildLinearPath(points);
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

const uniqueSortedDates = (series = []) => {
  const set = new Set();
  series.forEach((line) => {
    (line?.data || []).forEach((row) => {
      if (row?.date) set.add(`${row.date}`);
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const buildAreaPath = (points, baselineY) => {
  if (!points.length) return '';
  const line = buildLinearPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
};

const faded = (hex) => {
  if (!hex || typeof hex !== 'string') return '#0f172a20';
  if (hex.startsWith('#') && hex.length === 7) return `${hex}20`;
  return hex;
};

export default function InteractiveLineChart({
  title = '',
  ariaLabel = 'Line chart',
  series = [],
  yLabel = '',
  yLabelRight = '',
  xLabel = '',
  valueFormat = defaultValueFormat,
  valueFormatRight,
  dateFormat = defaultDateFormat,
  referenceLines = [],
  onPointClick,
  onDateClick,
  emptyLabel = 'Pas assez de donnees',
  smooth = true,
  pointMode = 'hover',
  enableTypeSwitch = true,
  defaultType = 'line',
}) {
  const [activeIndex, setActiveIndex] = useState(null);
  const [hiddenSeries, setHiddenSeries] = useState(new Set());
  const [chartType, setChartType] = useState(defaultType);
  const [hoverPosition, setHoverPosition] = useState(null);
  const chartRef = useRef(null);

  const dates = useMemo(() => uniqueSortedDates(series), [series]);

  const prepared = useMemo(() => {
    const lines = series.map((line, lineIdx) => {
      const mapByDate = new Map((line.data || []).map((row) => [row.date, toChartValue(row.value)]));
      return {
        ...line,
        axis: line.axis === 'right' ? 'right' : 'left',
        color: line.color || '#0f172a',
        points: dates.map((date, idx) => ({
          lineIdx,
          date,
          idx,
          value: mapByDate.has(date) ? mapByDate.get(date) : null,
        })),
      };
    });
    return lines;
  }, [dates, series]);

  const visibleLines = useMemo(
    () => prepared.filter((line) => !hiddenSeries.has(line.id || line.label)),
    [hiddenSeries, prepared],
  );

  const computeRange = (axis) => {
    const values = [];
    visibleLines
      .filter((line) => line.axis === axis)
      .forEach((line) => line.points.forEach((p) => {
        if (p.value !== null && Number.isFinite(p.value)) values.push(p.value);
      }));
    referenceLines
      .filter((r) => (r.axis || 'left') === axis)
      .forEach((r) => {
        const v = Number(r.value);
        if (Number.isFinite(v)) values.push(v);
      });
    if (!values.length) return { min: 0, max: 1 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pad = span * 0.12;
    return { min: min - pad, max: max + pad };
  };

  const yLeft = useMemo(() => computeRange('left'), [visibleLines, referenceLines]);
  const yRight = useMemo(() => computeRange('right'), [visibleLines, referenceLines]);

  const valueToY = (value, axis) => {
    const range = axis === 'right' ? yRight : yLeft;
    const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
    return PAD_TOP + (1 - (value - range.min) / Math.max(range.max - range.min, 1)) * plotH;
  };

  const scaled = useMemo(() => {
    const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
    const stepX = dates.length > 1 ? plotW / (dates.length - 1) : 0;
    const indexToX = (index) => PAD_LEFT + index * stepX;

    return visibleLines.map((line) => {
      const points = line.points.map((point) => ({
        ...point,
        x: indexToX(point.idx),
        y: point.value === null ? null : valueToY(point.value, line.axis),
      }));
      const pathPoints = points.filter((p) => p.y !== null).map((p) => ({ x: p.x, y: p.y }));
      const path = smooth ? buildSmoothPath(pathPoints) : buildLinearPath(pathPoints);
      return {
        ...line,
        points,
        path,
        areaPath: buildAreaPath(pathPoints, CHART_H - PAD_BOTTOM),
      };
    });
  }, [dates.length, smooth, visibleLines, yLeft.max, yLeft.min, yRight.max, yRight.min]);

  const yTicks = (axis) => {
    const range = axis === 'right' ? yRight : yLeft;
    const count = 5;
    const ticks = [];
    for (let i = 0; i < count; i += 1) {
      const ratio = i / (count - 1);
      const value = range.max - (range.max - range.min) * ratio;
      const y = PAD_TOP + (CHART_H - PAD_TOP - PAD_BOTTOM) * ratio;
      ticks.push({ value, y });
    }
    return ticks;
  };

  const xTicks = useMemo(() => {
    if (!dates.length) return [];
    const maxTicks = 7;
    if (dates.length <= maxTicks) {
      return dates.map((date, idx) => ({
        date,
        idx,
        x: PAD_LEFT + ((CHART_W - PAD_LEFT - PAD_RIGHT) * idx) / Math.max(1, dates.length - 1),
      }));
    }
    const step = Math.ceil(dates.length / maxTicks);
    return dates
      .map((date, idx) => ({ date, idx }))
      .filter((x) => x.idx % step === 0 || x.idx === dates.length - 1)
      .map((item) => ({
        ...item,
        x: PAD_LEFT + ((CHART_W - PAD_LEFT - PAD_RIGHT) * item.idx) / Math.max(1, dates.length - 1),
      }));
  }, [dates]);

  const pointsByDate = useMemo(() => {
    if (activeIndex === null) return [];
    const date = dates[activeIndex];
    return scaled
      .map((line) => ({ line, point: line.points.find((p) => p.date === date) || null }))
      .filter((row) => row.point && row.point.value !== null);
  }, [activeIndex, dates, scaled]);

  const activeX = activeIndex === null ? null : (PAD_LEFT + ((CHART_W - PAD_LEFT - PAD_RIGHT) * activeIndex) / Math.max(1, dates.length - 1));

  const syncHoverFromMouseEvent = (event) => {
    const svgElement = chartRef.current;
    if (!svgElement) return;
    const rect = svgElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const xInSvg = ((event.clientX - rect.left) / rect.width) * CHART_W;
    const yInSvg = ((event.clientY - rect.top) / rect.height) * CHART_H;
    const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
    const ratio = clamp((xInSvg - PAD_LEFT) / Math.max(plotW, 1), 0, 1);
    const idx = Math.round(ratio * Math.max(0, dates.length - 1));
    setActiveIndex(idx);
    setHoverPosition({
      x: clamp(xInSvg, PAD_LEFT, CHART_W - PAD_RIGHT),
      y: clamp(yInSvg, PAD_TOP, CHART_H - PAD_BOTTOM),
    });
  };

  const floatingTooltipStyle = useMemo(() => {
    if (activeIndex === null) return null;
    const x = hoverPosition?.x ?? activeX ?? PAD_LEFT;
    const yFallback = pointsByDate.length
      ? Math.min(...pointsByDate.map((row) => Number(row.point?.y || CHART_H / 2)))
      : CHART_H / 2;
    const y = hoverPosition?.y ?? yFallback;
    const xPct = clamp((x / CHART_W) * 100, 6, 94);
    const yPct = clamp((y / CHART_H) * 100, 8, 92);
    const shiftX = xPct > 72 ? '-102%' : '10px';
    const shiftY = yPct < 24 ? '12px' : '-12px';
    return {
      left: `${xPct}%`,
      top: `${yPct}%`,
      transform: `translate(${shiftX}, ${shiftY})`,
    };
  }, [activeIndex, activeX, hoverPosition, pointsByDate]);

  if (!dates.length || scaled.every((line) => !line.points.some((p) => p.value !== null))) {
    return (
      <div className={styles.chartCardWrap}>
        {title && <h3>{title}</h3>}
        <p className={styles.smallMuted}>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className={styles.chartCardWrap}>
      <div className={styles.chartHead}>
        {title ? <h3>{title}</h3> : <span />}
        <div className={styles.chartLegend}>
          {enableTypeSwitch && (
            <select className={styles.layoutSelect} value={chartType} onChange={(e) => setChartType(e.target.value)}>
              <option value="line">Courbe</option>
              <option value="area">Aire</option>
              <option value="bar">Barres</option>
            </select>
          )}
          {prepared.map((line) => {
            const key = line.id || line.label;
            const hidden = hiddenSeries.has(key);
            return (
              <button
                key={key}
                type="button"
                className={styles.chartLegendItem}
                style={{ opacity: hidden ? 0.45 : 1 }}
                onClick={() => {
                  setHiddenSeries((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
              >
                <span className={styles.chartLegendSwatch} style={{ backgroundColor: line.color }} />
                {line.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.chartCanvas}>
        <svg
          ref={chartRef}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          className={styles.chartSvg}
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => {
            setActiveIndex(null);
            setHoverPosition(null);
          }}
        >
          <rect x="0" y="0" width={CHART_W} height={CHART_H} fill="#ffffff" />

          {yTicks('left').map((tick) => (
            <g key={`yl-${tick.y}`}>
              <line x1={PAD_LEFT} y1={tick.y} x2={CHART_W - PAD_RIGHT} y2={tick.y} stroke="#e2e8f0" />
              <text x={PAD_LEFT - 8} y={tick.y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                {valueFormat(tick.value)}
              </text>
            </g>
          ))}

          {scaled.some((line) => line.axis === 'right') && yTicks('right').map((tick) => (
            <g key={`yr-${tick.y}`}>
              <text x={CHART_W - PAD_RIGHT + 6} y={tick.y + 4} textAnchor="start" fontSize="11" fill="#64748b">
                {(valueFormatRight || valueFormat)(tick.value)}
              </text>
            </g>
          ))}

          {xTicks.map((tick) => (
            <g key={`x-${tick.date}`}>
              <line x1={tick.x} y1={PAD_TOP} x2={tick.x} y2={CHART_H - PAD_BOTTOM} stroke="#f1f5f9" />
              <text x={tick.x} y={CHART_H - PAD_BOTTOM + 16} textAnchor="middle" fontSize="11" fill="#64748b">
                {dateFormat(tick.date)}
              </text>
            </g>
          ))}

          {referenceLines.map((line) => {
            const value = Number(line.value);
            if (!Number.isFinite(value)) return null;
            const axis = line.axis === 'right' ? 'right' : 'left';
            const y = clamp(valueToY(value, axis), PAD_TOP, CHART_H - PAD_BOTTOM);
            return (
              <g key={`ref-${line.label || `${axis}-${value}`}`}>
                <line x1={PAD_LEFT} y1={y} x2={CHART_W - PAD_RIGHT} y2={y} stroke={line.color || '#94a3b8'} strokeDasharray="5 5" />
                <text x={CHART_W - PAD_RIGHT - 4} y={y - 4} textAnchor="end" fontSize="11" fill={line.color || '#64748b'}>
                  {line.label || valueFormat(value)}
                </text>
              </g>
            );
          })}

          {activeX !== null && (
            <line x1={activeX} y1={PAD_TOP} x2={activeX} y2={CHART_H - PAD_BOTTOM} stroke="#94a3b8" strokeDasharray="3 4" />
          )}

          {scaled.map((line, lineIdx) => {
            if (chartType === 'bar') {
              const visibleCount = Math.max(1, scaled.length);
              const groupWidth = (CHART_W - PAD_LEFT - PAD_RIGHT) / Math.max(1, dates.length) * 0.72;
              const barWidth = Math.max(2, groupWidth / visibleCount);
              return (
                <g key={`bars-${line.id || line.label}`}>
                  {line.points.map((point) => {
                    if (point.y === null) return null;
                    const left = point.x - groupWidth / 2 + lineIdx * barWidth;
                    const h = CHART_H - PAD_BOTTOM - point.y;
                    return (
                      <rect
                        key={`${line.id || line.label}-${point.date}`}
                        x={left}
                        y={point.y}
                        width={barWidth - 1}
                        height={Math.max(0, h)}
                        fill={faded(line.color)}
                        stroke={line.color}
                        onMouseEnter={() => {
                          setActiveIndex(point.idx);
                          setHoverPosition({ x: point.x, y: point.y });
                        }}
                        onClick={() => {
                          setActiveIndex(point.idx);
                          setHoverPosition({ x: point.x, y: point.y });
                          if (onPointClick) onPointClick({ line, point });
                          if (onDateClick) onDateClick(point.date);
                        }}
                      />
                    );
                  })}
                </g>
              );
            }

            return (
              <g key={`line-${line.id || line.label}`}>
                {(chartType === 'area') && line.areaPath && <path d={line.areaPath} fill={faded(line.color)} stroke="none" />}
                {line.path && <path d={line.path} fill="none" stroke={line.color} strokeWidth="2.8" />}
                {line.points.map((point) => {
                  if (point.y === null) return null;
                  const isActive = activeIndex === point.idx;
                  const visibleRadius = pointMode === 'always' ? (isActive ? 4.8 : 2.8) : (isActive ? 4.8 : 1.6);
                  return (
                    <g key={`${line.id || line.label}-${point.date}`}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={visibleRadius}
                        fill={line.color}
                        stroke="#ffffff"
                        strokeWidth="1.4"
                        className={styles.chartPoint}
                        tabIndex={0}
                        role="button"
                        aria-label={`${line.label} ${dateFormat(point.date)} ${valueFormat(point.value)}`}
                        onMouseEnter={() => {
                          setActiveIndex(point.idx);
                          setHoverPosition({ x: point.x, y: point.y });
                        }}
                        onFocus={() => {
                          setActiveIndex(point.idx);
                          setHoverPosition({ x: point.x, y: point.y });
                        }}
                        onClick={() => {
                          setActiveIndex(point.idx);
                          setHoverPosition({ x: point.x, y: point.y });
                          if (onPointClick) onPointClick({ line, point });
                          if (onDateClick) onDateClick(point.date);
                        }}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          <rect
            x={PAD_LEFT}
            y={PAD_TOP}
            width={CHART_W - PAD_LEFT - PAD_RIGHT}
            height={CHART_H - PAD_TOP - PAD_BOTTOM}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onMouseMove={syncHoverFromMouseEvent}
            onClick={(event) => {
              syncHoverFromMouseEvent(event);
              if (!onDateClick) return;
              const svgElement = chartRef.current;
              if (!svgElement) return;
              const rect = svgElement.getBoundingClientRect();
              if (!rect.width || !rect.height) return;
              const xInSvg = ((event.clientX - rect.left) / rect.width) * CHART_W;
              const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
              const ratio = clamp((xInSvg - PAD_LEFT) / Math.max(plotW, 1), 0, 1);
              const idx = Math.round(ratio * Math.max(0, dates.length - 1));
              onDateClick(dates[idx]);
            }}
          />

          <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={CHART_H - PAD_BOTTOM} stroke="#94a3b8" />
          <line x1={PAD_LEFT} y1={CHART_H - PAD_BOTTOM} x2={CHART_W - PAD_RIGHT} y2={CHART_H - PAD_BOTTOM} stroke="#94a3b8" />

          {yLabel && (
            <text x="16" y={CHART_H / 2} transform={`rotate(-90 16 ${CHART_H / 2})`} textAnchor="middle" fontSize="12" fill="#334155">
              {yLabel}
            </text>
          )}
          {yLabelRight && scaled.some((line) => line.axis === 'right') && (
            <text x={CHART_W - 14} y={CHART_H / 2} transform={`rotate(-90 ${CHART_W - 14} ${CHART_H / 2})`} textAnchor="middle" fontSize="12" fill="#334155">
              {yLabelRight}
            </text>
          )}
          {xLabel && (
            <text x={CHART_W / 2} y={CHART_H - 8} textAnchor="middle" fontSize="12" fill="#334155">
              {xLabel}
            </text>
          )}
        </svg>

        {activeIndex !== null && floatingTooltipStyle && (
          <div className={styles.chartTooltipFloating} style={floatingTooltipStyle}>
            <strong>{dateFormat(dates[activeIndex])}</strong>
            {pointsByDate.map((row) => (
              <div key={`${row.line.id || row.line.label}-${dates[activeIndex]}`}>
                <span style={{ color: row.line.color }}>*</span> {row.line.label}: {row.line.axis === 'right' && valueFormatRight
                  ? valueFormatRight(row.point.value)
                  : valueFormat(row.point.value)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
