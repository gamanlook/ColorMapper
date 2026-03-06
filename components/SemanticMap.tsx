import React, { useMemo, useRef, useEffect, useState } from "react";
import * as d3 from "d3";
import { Delaunay } from "d3-delaunay";
import { ColorEntry, OklchColor } from "../types";
import { MAX_CHROMA } from "../constants";
import { toCss, findMaxChroma } from "../utils";

interface SemanticMapProps {
  hue: number;
  data: ColorEntry[];
  currentColor: OklchColor | null;
  width?: number;
  height?: number;
}

interface SemanticCluster {
  displayLabel: string;
  l: number;
  c: number;
  totalVotes: number;
  composition: { name: string; count: number; percentage: number }[];
}

const SemanticMap: React.FC<SemanticMapProps> = ({
  hue,
  data,
  currentColor,
  width = 360,
  height = 360,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  // D3 偵測到的目標
  const [hoveredCluster, setHoveredCluster] = useState<SemanticCluster | null>(null);

  // ==========================================
  // ✨ Tooltip 動畫狀態機 (支援進退場與高度形變)
  // ==========================================
  const[tooltipData, setTooltipData] = useState<SemanticCluster | null>(null);
  const[isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [isTooltipRendered, setIsTooltipRendered] = useState(false);
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 用來記錄「實際像素高度」的 state 與內部內容的 ref
  const [tooltipHeight, setTooltipHeight] = useState<number | undefined>(undefined);
  const tooltipContentRef = useRef<HTMLDivElement>(null);

  // 隱形皮尺：動態測量內容高度，讓 CSS 可以執行 transition 形變
  useEffect(() => {
    if (!tooltipContentRef.current) return;

    const observer = new ResizeObserver(() => {
      // 取得內部容器瞬間渲染出來的精確高度
      const newHeight = tooltipContentRef.current?.offsetHeight;
      if (newHeight) {
        setTooltipHeight(newHeight);
      }
    });
    
    observer.observe(tooltipContentRef.current);
    return () => observer.disconnect();
  }, [isTooltipRendered]);

  // 進退場狀態控制
  useEffect(() => {
    if (hoveredCluster) {
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      
      setTooltipData(hoveredCluster);
      setIsTooltipRendered(true);
      
      const enterTimer = setTimeout(() => {
        setIsTooltipVisible(true);
      }, 10);
      return () => clearTimeout(enterTimer);
    } else {
      setIsTooltipVisible(false);
      
      exitTimeoutRef.current = setTimeout(() => {
        setIsTooltipRendered(false);
        setTooltipData(null);
        setTooltipHeight(undefined);
      }, 300);
    }
  }, [hoveredCluster]);
  // ==========================================

  const hueData = useMemo(() => {
    return data.filter((d) => d.color.h === hue && !d.isSuspicious);
  }, [data, hue]);

  const semanticClusters = useMemo(() => {
    if (hueData.length === 0) return[];

    const rawGroups = d3.group(hueData, (d) => d.name);
    let clusters: any[] =[];

    rawGroups.forEach((entries, name) => {
      const avgL = d3.mean(entries, (d) => d.color.l) || 0;
      const avgC = d3.mean(entries, (d) => d.color.c) || 0;
      clusters.push({
        names: [{ name, count: entries.length }],
        l: avgL,
        c: avgC,
        totalVotes: entries.length,
      });
    });

    const DISTANCE_THRESHOLD = 0.08;

    const getDistance = (c1: any, c2: any) => {
      const dL = c1.l - c2.l;
      const dC = (c1.c - c2.c) * 3;
      return Math.sqrt(dL * dL + dC * dC);
    };

    let changed = true;
    while (changed && clusters.length > 1) {
      changed = false;
      let minDist = Infinity;
      let mergePair = [-1, -1];

      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const dist = getDistance(clusters[i], clusters[j]);
          if (dist < minDist) {
            minDist = dist;
            mergePair = [i, j];
          }
        }
      }

      if (minDist < DISTANCE_THRESHOLD) {
        const [i, j] = mergePair;
        const c1 = clusters[i];
        const c2 = clusters[j];

        const totalVotes = c1.totalVotes + c2.totalVotes;
        const newL = (c1.l * c1.totalVotes + c2.l * c2.totalVotes) / totalVotes;
        const newC = (c1.c * c1.totalVotes + c2.c * c2.totalVotes) / totalVotes;

        const mergedCluster = {
          names:[...c1.names, ...c2.names],
          l: newL,
          c: newC,
          totalVotes: totalVotes,
        };

        clusters.splice(j, 1);
        clusters.splice(i, 1);
        clusters.push(mergedCluster);

        changed = true;
      }
    }

    return clusters.map((c) => {
      const sortedNames = c.names.sort((a: any, b: any) => b.count - a.count);
      const dominant = sortedNames[0];

      const composition = sortedNames.map((n: any) => ({
        name: n.name,
        count: n.count,
        percentage: Math.round((n.count / c.totalVotes) * 100),
      }));

      return {
        displayLabel: dominant.name,
        l: c.l,
        c: c.c,
        totalVotes: c.totalVotes,
        composition: composition,
      } as SemanticCluster;
    });
  }, [hueData]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 40, bottom: 40, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const xScale = d3
      .scaleLinear()
      .domain([0, MAX_CHROMA])
      .range([0, chartWidth]);
    const yScale = d3.scaleLinear().domain([0, 1]).range([chartHeight, 0]);

    const mainChartGroup = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const layerGamut = mainChartGroup.append("g").attr("class", "layer-gamut");
    const layerCells = mainChartGroup.append("g").attr("class", "layer-cells");
    const layerDots = mainChartGroup.append("g").attr("class", "layer-dots");
    const layerLabels = mainChartGroup
      .append("g")
      .attr("class", "layer-labels");
    const layerHover = mainChartGroup
      .append("g")
      .attr("class", "layer-hover");
    const layerTarget = mainChartGroup
      .append("g")
      .attr("class", "layer-target")
      .style("pointer-events", "none");
    const layerAxes = mainChartGroup.append("g").attr("class", "layer-axes");

    const gamutPoints: [number, number][] = [];
    gamutPoints.push([0, 0]);

    for (let l = 0.1; l <= 1.0; l += 0.01) {
      const maxC = findMaxChroma(l, hue);
      gamutPoints.push([maxC, l]);
    }

    gamutPoints.push([0, 1]);
    gamutPoints.push([0, 0]);

    const lineGenerator = d3
      .line()
      .x((d) => xScale(d[0]))
      .y((d) => yScale(d[1]))
      .curve(d3.curveLinear);

    const gamutPathStr = lineGenerator(gamutPoints);

    if (gamutPathStr) {
      layerGamut
        .append("path")
        .attr("d", gamutPathStr)
        .attr("fill", "none")
        .attr("stroke", "var(--color-chart-gamut)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4 4")
        .attr("pointer-events", "none");
    }

    if (semanticClusters.length === 0) {
      layerLabels
        .append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--color-chart-axis)")
        .attr("font-family", "inherit")
        .text("No data for this hue yet");
    } else {
      const points: [number, number][] = semanticClusters.map((d) => [
        xScale(d.c),
        yScale(d.l),
      ]);
      const delaunay = Delaunay.from(points);
      const voronoi = delaunay.voronoi([0, 0, chartWidth, chartHeight]);

      semanticClusters.forEach((cluster, i) => {
        const path = voronoi.renderCell(i);
        const cellColor = toCss({ l: cluster.l, c: cluster.c, h: hue });

        let labelX = xScale(cluster.c);
        let labelY = yScale(cluster.l);
        const polygon = voronoi.cellPolygon(i);
        if (polygon && polygon.length > 0) {
          const[px, py] = d3.polygonCentroid(polygon);
          if (!isNaN(px) && !isNaN(py)) {
            labelX = px;
            labelY = py;
          }
        }

        const cellG = layerCells
          .append("g")
          .attr("class", "cursor-pointer transition-opacity duration-200")
          .on("mouseenter", () => setHoveredCluster(cluster))
          .on("mouseleave", () => setHoveredCluster(null));

        cellG
          .append("path")
          .attr("d", path)
          .attr("fill", cellColor)
          .attr("stroke", "var(--color-chart-grid)")
          .attr("stroke-width", 1)
          .attr("opacity", 0.6)
          .on("mouseover", function () {
            const el = d3.select(this);
            el.attr("opacity", 0.9);
            
            // Draw hover stroke in layerHover
            layerHover
              .append("path")
              .attr("d", el.attr("d"))
              .attr("fill", "none")
              .attr("stroke", "rgba(255,255,255,0.8)")
              .attr("stroke-width", 2)
              .attr("pointer-events", "none");
            
            // Hide base label
            d3.select(`#label-${hue}-${i}`).attr("opacity", 0);

            // Draw 3-layer text in layerHover
            layerHover
              .append("text")
              .attr("x", labelX)
              .attr("y", labelY)
              .attr("dy", "0.35em")
              .attr("text-anchor", "middle")
              .attr("font-size", "12px")
              .attr("font-weight", "500")
              .attr("font-family", "inherit")
              .attr("fill", "white")
              .style("filter", "drop-shadow(0px 1px 4px rgba(0,0,0,0.2))")
              .style("mix-blend-mode", "multiply")
              .text(cluster.displayLabel)
              .attr("pointer-events", "none");

            layerHover
              .append("text")
              .attr("x", labelX)
              .attr("y", labelY)
              .attr("dy", "0.35em")
              .attr("text-anchor", "middle")
              .attr("font-size", "12px")
              .attr("font-weight", "500")
              .attr("font-family", "inherit")
              .attr("fill", "white")
              .style("filter", "drop-shadow(0px 1px 4px rgba(85,85,85,0.6))")
              .style("mix-blend-mode", "color-burn")
              .text(cluster.displayLabel)
              .attr("pointer-events", "none");

            layerHover
              .append("text")
              .attr("x", labelX)
              .attr("y", labelY)
              .attr("dy", "0.35em")
              .attr("text-anchor", "middle")
              .attr("font-size", "12px")
              .attr("font-weight", "500")
              .attr("font-family", "inherit")
              .attr("fill", "white")
              .text(cluster.displayLabel)
              .attr("pointer-events", "none");
          })
          .on("mouseout", function () {
            d3.select(this).attr("opacity", 0.6);
            
            // Clear hover layer
            layerHover.selectAll("*").remove();
            
            // Restore base label
            d3.select(`#label-${hue}-${i}`).attr("opacity", 1);
          });

        layerLabels
          .append("text")
          .attr("id", `label-${hue}-${i}`)
          .attr("x", labelX)
          .attr("y", labelY)
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .attr("font-size", "12px")
          .attr("font-weight", "500")
          .attr("font-family", "inherit")
          .attr("fill", "var(--color-chart-text-cell-dark)")
          .text(cluster.displayLabel)
          .attr("pointer-events", "none");
      });
    }

    if (hueData.length > 0) {
      layerDots
        .append("g")
        .selectAll("circle")
        .data(hueData)
        .join("circle")
        .attr("cx", (d) => xScale(d.color.c))
        .attr("cy", (d) => yScale(d.color.l))
        .attr("r", 2.5)
        .attr("fill", (d) => toCss(d.color))
        .attr("stroke", (d) =>
          d.color.l > 0.5 ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.4)",
        )
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.9)
        .attr("pointer-events", "none");
    }

    if (currentColor && currentColor.h === hue) {
      const cx = xScale(currentColor.c);
      const cy = yScale(currentColor.l);

      const pulseG = layerTarget.append("g");
      pulseG
        .append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 8)
        .attr("fill", "none")
        .attr("stroke", "white")
        .attr("stroke-width", 1)
        .append("animate")
        .attr("attributeName", "r")
        .attr("values", "8; 28")
        .attr("dur", "1.5s")
        .attr("repeatCount", "indefinite");

      pulseG
        .select("circle")
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0.8; 0")
        .attr("dur", "1.5s")
        .attr("repeatCount", "indefinite");

      layerTarget
        .append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 6)
        .attr("fill", toCss(currentColor))
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .attr("filter", "drop-shadow(0px 2px 8px rgba(255,255,255,0.5))");
    }

    const yAxis = d3
      .axisLeft(yScale)
      .ticks(5)
      .tickFormat((d) => `${(d as number) * 100}`);
    const xAxis = d3.axisBottom(xScale).ticks(5);

    const yAxisGroup = layerAxes
      .append("g")
      .attr("transform", "translate(-1, 0)")
      .call(yAxis)
      .attr("class", "select-none")
      .attr("color", "var(--color-chart-axis)")
      .attr("font-family", "inherit");

    yAxisGroup.select(".domain").remove();

    const xAxisGroup = layerAxes
      .append("g")
      .attr("transform", `translate(0,${chartHeight + 1})`)
      .call(xAxis)
      .attr("class", "select-none")
      .attr("color", "var(--color-chart-axis)")
      .attr("font-family", "inherit");

    xAxisGroup.select(".domain").remove();

    xAxisGroup
      .append("line")
      .attr("x1", chartWidth)
      .attr("x2", chartWidth)
      .attr("y1", 0)
      .attr("y2", 6)
      .attr("stroke", "currentColor");
  }, [hue, hueData, currentColor, width, height, semanticClusters]);

  return (
    <div className="relative flex justify-center w-full max-w-[480px]">
      <div className="isolate w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          style={{ overflow: "visible" }}
        />
      </div>

      {/* Tooltip */}
      {isTooltipRendered && tooltipData && (
        <div 
          className={`
            absolute -bottom-4 -right-2 z-10 pointer-events-none 
            bg-theme-toast-bg rounded-2xl shadow-2xl border border-theme-toast-border 
            text-sm min-w-[180px] overflow-hidden
            transform will-change-[transform,height,opacity] 
            /* 這裡刪除了原本的 transition-all duration-500，交給下方的 style 獨立控制 */
            ${
              isTooltipVisible
                ? "translate-y-0 opacity-100 backdrop-blur-2xl scale-100"
                : "translate-y-4 opacity-0 backdrop-blur-none scale-95"
            }
          `}
          style={{ 
            height: tooltipHeight ? `${tooltipHeight + 2}px` : "auto",
            // 高度 (A到B形變) 給 1000ms
            transition: `
              height 1000ms cubic-bezier(0.16, 1, 0.3, 1), 
              opacity 500ms cubic-bezier(0.16, 1, 0.3, 1), 
              transform 500ms cubic-bezier(0.16, 1, 0.3, 1), 
              backdrop-filter 500ms cubic-bezier(0.16, 1, 0.3, 1),
              -webkit-backdrop-filter 500ms cubic-bezier(0.16, 1, 0.3, 1)
            `
          }}
        >
          {/*
            ==================================================
            📐 第一層：隱形皮尺區 (Measuring Div)用來讓 Observer 瞬間量出正確的未來高度。
            注意：這裡的結構要跟下面完全同步！
            ==================================================
          */}
          <div
            ref={tooltipContentRef}
            className="invisible absolute top-0 left-0 w-full p-4 pb-0 flex flex-col"
            aria-hidden="true"
          >
            <div className="font-bold text-lg mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full border" />
              {tooltipData.displayLabel}
            </div>
            <div className="space-y-1.5 pb-3">
              {tooltipData.composition.map((item, idx) => (
                <div key={`measure-${item.name}`} className="flex justify-between text-xs">
                  <span>{item.name}</span>
                  <span>{item.percentage}%</span>
                </div>
              ))}
            </div>
            <div className="py-3 border-t text-[0.625rem] font-mono tracking-wider uppercase">
              Total Votes: {tooltipData.totalVotes}
            </div>
          </div>

          {/*
            ==================================================
            📺 第二層：實際顯示區 (Display Div)
            ==================================================
          */}
          <div className="absolute inset-0 w-full h-full flex flex-col p-4 pb-0">
            
            {/* Header：禁止壓縮 (shrink-0) */}
            <div className="font-bold text-text-main mb-2 flex items-center gap-2 text-lg shrink-0">
              <span
                className="w-5 h-5 rounded-full border border-white/30 shadow-sm transition-colors duration-0"
                style={{
                  backgroundColor: toCss({
                    l: tooltipData.l,
                    c: tooltipData.c,
                    h: hue,
                  }),
                }}
              ></span>
              {tooltipData.displayLabel}
            </div>

            {/* List：形變空間 */}
            <div className="flex-1 min-h-0 overflow-hidden relative">
              {/* 透過 absolute 確保內容不會因為容器縮小而被暴力壓扁 */}
              <div className="space-y-1.5 pb-3 absolute top-0 left-0 w-full">
                {tooltipData.composition.map((item, idx) => (
                  <div
                    key={`display-${item.name}`} 
                    className="flex justify-between items-center text-xs"
                  >
                    <span className={idx === 0 ? "text-white font-medium" : "text-white/50"}>
                      {item.name}
                    </span>
                    <span className="text-white/50 ml-4 font-mono">
                      {item.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer：永遠平滑地黏在板子最底端 */}
            <div className="py-3 border-t border-white/10 text-[0.625rem] font-mono tracking-wider text-white/30 uppercase shrink-0 transition-colors duration-0">
              Total Votes: {tooltipData.totalVotes}
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
};

export default SemanticMap;
