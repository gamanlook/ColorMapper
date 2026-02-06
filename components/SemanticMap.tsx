import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { Delaunay } from 'd3-delaunay';
import { ColorEntry, OklchColor } from '../types';
import { MAX_CHROMA } from '../constants';
import { toCss, findMaxChroma } from '../utils';

interface SemanticMapProps {
  hue: number;
  data: ColorEntry[];
  currentColor: OklchColor | null;
  width?: number;
  height?: number;
}

// Data structure for a merged cluster
interface SemanticCluster {
  displayLabel: string; // The dominant name (e.g., "淺紫")
  l: number; // Centroid L
  c: number; // Centroid C
  totalVotes: number;
  composition: { name: string; count: number; percentage: number }[]; // Breakdown
}

const SemanticMap: React.FC<SemanticMapProps> = ({ hue, data, currentColor, width = 360, height = 360 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredCluster, setHoveredCluster] = useState<SemanticCluster | null>(null);

  // Filter data for this specific hue slice
  const hueData = useMemo(() => {
    return data.filter(d => d.color.h === hue && !d.isSuspicious);
  }, [data, hue]);

  // --- CLUSTERING ALGORITHM ---
  const semanticClusters = useMemo(() => {
    if (hueData.length === 0) return [];

    // 1. Group by unique name first (Initial Clusters)
    const rawGroups = d3.group(hueData, d => d.name);
    let clusters: any[] = [];
    
    rawGroups.forEach((entries, name) => {
      const avgL = d3.mean(entries, d => d.color.l) || 0;
      const avgC = d3.mean(entries, d => d.color.c) || 0;
      clusters.push({
        names: [{ name, count: entries.length }], // Keep track of constituent names
        l: avgL,
        c: avgC,
        totalVotes: entries.length
      });
    });

    // 2. Hierarchical Agglomerative Clustering
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
          names: [...c1.names, ...c2.names],
          l: newL,
          c: newC,
          totalVotes: totalVotes
        };

        clusters.splice(j, 1);
        clusters.splice(i, 1);
        clusters.push(mergedCluster);
        
        changed = true;
      }
    }

    // 3. Finalize Output Format
    return clusters.map(c => {
      const sortedNames = c.names.sort((a: any, b: any) => b.count - a.count);
      const dominant = sortedNames[0];
      
      const composition = sortedNames.map((n: any) => ({
        name: n.name,
        count: n.count,
        percentage: Math.round((n.count / c.totalVotes) * 100)
      }));

      return {
        displayLabel: dominant.name,
        l: c.l,
        c: c.c,
        totalVotes: c.totalVotes,
        composition: composition
      } as SemanticCluster;
    });

  }, [hueData]);


  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    // 右 margin 59 原因為：60-1，60是真實數學數字，但圖表會有1寬度粗的線框切割，要再微調。 to visually center the chart in the 400px wide container
    const margin = { top: 20, right: 59, bottom: 60, left: 61 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // SCALES
    const xScale = d3.scaleLinear().domain([0, MAX_CHROMA]).range([0, chartWidth]);
    const yScale = d3.scaleLinear().domain([0, 1]).range([chartHeight, 0]);

    const mainChartGroup = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // --- LAYERS (Z-Index Management) ---
    // 建立圖層順序，確保 hover 時的放大與邊框不會蓋住更重要的資訊
    // Order: Gamut < Cells < Dots < Labels < Target < Axes
    const layerGamut = mainChartGroup.append("g").attr("class", "layer-gamut");
    const layerCells = mainChartGroup.append("g").attr("class", "layer-cells");
    const layerDots = mainChartGroup.append("g").attr("class", "layer-dots");
    const layerLabels = mainChartGroup.append("g").attr("class", "layer-labels"); // ✨ 新增文字層 (在 Dots 之上)
    const layerTarget = mainChartGroup.append("g").attr("class", "layer-target");
    const layerAxes = mainChartGroup.append("g").attr("class", "layer-axes");

    // --- 0. GAMUT BOUNDARY (Background Layer) ---
    const gamutPoints: [number, number][] = [];
    
    // VISUAL OPTIMIZATION:
    // Start explicitly at Black (0,0).
    gamutPoints.push([0, 0]);

    // Start detailed calculation from L=0.10 (10%).
    // This intentionally skips the irregular/hook-shaped gamut boundary at very low lightness (0-0.09).
    // Connecting Black (0,0) directly to L(0.10) creates a cleaner, more aesthetic "triangular" base.
    for (let l = 0.10; l <= 1.0; l += 0.01) {
      const maxC = findMaxChroma(l, hue);
      gamutPoints.push([maxC, l]);
    }
    
    // Ensure we close nicely at White
    gamutPoints.push([0, 1]); 
    // Close the loop back to bottom
    gamutPoints.push([0, 0]);

    const lineGenerator = d3.line()
      .x(d => xScale(d[0]))
      .y(d => yScale(d[1]))
      .curve(d3.curveLinear);

    const gamutPathStr = lineGenerator(gamutPoints);

    if (gamutPathStr) {
      layerGamut.append("path")
        .attr("d", gamutPathStr)
        .attr("fill", "none")
        .attr("stroke", "var(--color-chart-gamut)") // Use CSS Variable
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4 2")
        .attr("pointer-events", "none");
    }

    // --- 1. VORONOI TESSELLATION (Territories) ---
    if (semanticClusters.length === 0) {
      layerLabels.append("text")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--color-chart-axis)")
        .text("此色相尚無資料");
    } else {
      const points: [number, number][] = semanticClusters.map(d => [xScale(d.c), yScale(d.l)]);
      const delaunay = Delaunay.from(points);
      const voronoi = delaunay.voronoi([0, 0, chartWidth, chartHeight]);

      semanticClusters.forEach((cluster, i) => {
        const path = voronoi.renderCell(i);
        const cellColor = toCss({ l: cluster.l, c: cluster.c, h: hue });
        const isLight = cluster.l > 0.6;

        // 注意：這裡 append 到 layerCells
        const cellG = layerCells.append("g")
          .attr("class", "cursor-pointer transition-opacity duration-200")
          .on("mouseenter", () => setHoveredCluster(cluster))
          .on("mouseleave", () => setHoveredCluster(null));

        cellG.append("path")
          .attr("d", path)
          .attr("fill", cellColor)
          .attr("stroke", "var(--color-chart-grid)") // Use CSS variable for cell border
          .attr("stroke-width", 1)
          .attr("opacity", 0.7)
          .on("mouseover", function() { 
             const el = d3.select(this);
             const parent = d3.select(this.parentNode as Element);

             // ✨ 關鍵修改：將整個群組拉到 layerCells 的最上層，確保邊框蓋住鄰居
             parent.raise();

             // 1. 稍微加深底色
             el.attr("opacity", 0.9);

             // 2. 複製一個 Path 疊加上去當作內框
             parent.append("path")
               .attr("class", "hover-stroke") // 標記用，方便移除
               .attr("d", el.attr("d"))       // 形狀完全一樣
               .attr("fill", "none")          // 中間透明
               .attr("stroke", "var(--color-chart-grid)") // 使用指定的顏色
               .attr("stroke-width", 2)       // 線粗 2
               .attr("pointer-events", "none"); // 讓滑鼠穿透，不要干擾互動
          })
          .on("mouseout", function() { 
             // 1. 恢復原本透明度
             d3.select(this).attr("opacity", 0.7);

             // 2. 移除剛剛疊加的框線
             d3.select(this.parentNode as Element).selectAll(".hover-stroke").remove();
          });

        // Label: ✨ Moved to layerLabels to be above layerDots
        layerLabels.append("text")
          .attr("x", xScale(cluster.c))
          .attr("y", yScale(cluster.l))
          .attr("dy", "0.35em")
          .attr("text-anchor", "middle")
          .attr("font-size", "12px")
          .attr("font-weight", "600")
          // Use CSS variables for text contrast based on lightness
          .attr("fill", isLight ? "var(--color-chart-text-cell-light)" : "var(--color-chart-text-cell-dark)")
          .text(cluster.displayLabel)
          .attr("pointer-events", "none"); // 保持讓滑鼠穿透，才不會擋到下面色塊的 hover
      });
    }

    // --- 2. HISTORICAL DATA POINTS (Scatter Plot) ---
    if (hueData.length > 0) {
      layerDots.append("g")
        .selectAll("circle")
        .data(hueData)
        .join("circle")
        .attr("cx", d => xScale(d.color.c))
        .attr("cy", d => yScale(d.color.l))
        .attr("r", 2.5) 
        .attr("fill", d => toCss(d.color))
        .attr("stroke", d => d.color.l > 0.5 ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.4)")
        .attr("stroke-width", 0.5)
        .attr("opacity", 0.9)
        .attr("pointer-events", "none");
    }

    // --- 3. CURRENT TARGET INDICATOR ---
    if (currentColor && currentColor.h === hue) {
      const cx = xScale(currentColor.c);
      const cy = yScale(currentColor.l);
      const isBright = currentColor.l > 0.5;

      const pulseG = layerTarget.append("g");
      pulseG.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 8)
        .attr("fill", "none")
        .attr("stroke", isBright ? "black" : "white")
        .attr("stroke-width", 1)
        .append("animate")
        .attr("attributeName", "r")
        .attr("values", "8; 28")
        .attr("dur", "1.5s")
        .attr("repeatCount", "indefinite");
      
      pulseG.select("circle")
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0.8; 0")
        .attr("dur", "1.5s")
        .attr("repeatCount", "indefinite");

      layerTarget.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 10)
        .attr("fill", "none")
        .attr("stroke", isBright ? "black" : "white")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3 2")
        .attr("opacity", 0.7);

      layerTarget.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", 6)
        .attr("fill", toCss(currentColor))
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .attr("filter", "drop-shadow(0px 2px 3px rgba(0,0,0,0.3))");
    }

    // --- 4. AXES ---
    const yAxis = d3.axisLeft(yScale).ticks(5).tickFormat(d => `${(d as number) * 100}`);
    const xAxis = d3.axisBottom(xScale).ticks(5);

    const yAxisGroup = layerAxes.append("g")
      .attr("transform", "translate(-1, 0)")
      .call(yAxis)
      .attr("class", "select-none")
      .attr("color", "var(--color-chart-axis)") // Apply color via attribute to group
      .attr("font-family", "inherit");
    
    yAxisGroup.select(".domain").remove(); //移除長長的軸線 (如果想要隱藏軸線的話)


    const xAxisGroup = layerAxes.append("g")
      .attr("transform", `translate(0,${chartHeight + 1})`)
      .call(xAxis)
      .attr("class", "select-none")
      .attr("color", "var(--color-chart-axis)") // Apply color via attribute to group
      .attr("font-family", "inherit")

    xAxisGroup.select(".domain").remove(); //移除長長的軸線

    // 手動植牙，補上最右邊的收尾刻度
    xAxisGroup.append("line")
      .attr("x1", chartWidth)
      .attr("x2", chartWidth)
      .attr("y1", 0)
      .attr("y2", 6)
      .attr("stroke", "currentColor"); // 吃父層的 color 設定


    layerAxes.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -48)
      .attr("x", -chartHeight / 2)
      .attr("dy", "1em")
      .style("text-anchor", "middle")
      .attr("fill", "var(--color-chart-axis)")
      .attr("font-size", "12px")
      .text("LIGHTNESS (L) %");

    layerAxes.append("text")
      .attr("y", chartHeight + 40)
      .attr("x", chartWidth / 2)
      .style("text-anchor", "middle")
      .attr("fill", "var(--color-chart-axis)")
      .attr("font-size", "12px")
      .text("CHROMA (C)");

  }, [hue, hueData, currentColor, width, height, semanticClusters]);

  return (
    
    // RWD 邏輯更新：
    // Mobile: w-[calc(100%+3rem)] -mx-6 (維持滿版出血)
    // Desktop: lg:max-w-[400px] (維持原本雙欄設計的尺寸)
    
    <div className="relative flex justify-center w-[calc(100%+3rem)] -mx-6 max-w-[480px] lg:max-w-[416px]">
      <svg 
        ref={svgRef} 
        viewBox={`0 0 ${width} ${height}`}
        className="bg-theme-card w-full h-auto transition-colors duration-300"
      />
      
      {/* Enhanced Tooltip Overlay - Updated to match Toast style */}
      {hoveredCluster && (
        <div className="absolute -bottom-24 -right-2 lg:-bottom-16 lg:-right-6 bg-theme-toast-bg backdrop-blur-md p-4 rounded-2xl shadow-xl shadow-slate-700/10 dark:shadow-black/50 border border-theme-toast-border text-sm z-10 pointer-events-none transform transition-all duration-200 min-w-[160px]">
          <div className="font-bold text-theme-text-main mb-1 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full border border-white dark:border-white/50 shadow-sm" style={{backgroundColor: toCss({l: hoveredCluster.l, c: hoveredCluster.c, h: hue})}}></span>
            {hoveredCluster.displayLabel}
          </div>
          
          <div className="mt-3 space-y-1">
            {hoveredCluster.composition.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs">
                <span className={idx === 0 ? "text-theme-text-main font-medium" : "text-theme-text-muted"}>
                  {item.name}
                </span>
                <span className="text-theme-text-muted ml-3">{item.percentage}%</span>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-theme-toast-border text-xs text-theme-text-muted">
             總票數: {hoveredCluster.totalVotes}
          </div>
        </div>
      )}
    </div>
  );
};

export default SemanticMap;
