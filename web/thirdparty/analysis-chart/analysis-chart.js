class AnalysisChart {
    constructor(rootElement, data, opts) {
        this.onRangeSelectedCallbacks = [];

        this.rootElement = rootElement;
        this.rootElement.innerHTML = `
            <div class="main-column">
                    <div class="y-axis"></div>
                    <div class="chart-draw-area"></div>
                    <div class="x-axis"></div>
                    <div class="annotation-timeline"></div>
                    <div class="range-slider"></div>
            </div>
            <div class="right-column">
                <div class="legend"></div>
                <div class="options-panel">
                    <div class="legend-help-text">
                        <span class="arrow">&#x2B11;</span> <span>too much clutter? uncheck to temporarily hide metrics</span>
                    </div>
                    <div class="scaling-buttons-container">
                        <label>
                            <input type="radio" name="y-axis-scaling" class="btn-fixed-zero" />
                            Fixed Y-axis (fit to data, always include zero)
                        </label>
                        <label>
                            <input type="radio" name="y-axis-scaling" class="btn-fixed" />
                            Fixed Y-axis (fit to data, with padding)
                        </label>
                        <label>
                            <input type="radio" name="y-axis-scaling" class="btn-rescale" />
                            Rescale Y-axis to currently visible data
                        </label>
                    </div>
                </div>
                <div>
                    <div class="selection-inactive">Nothing selected. Drag-select a part of the chart using the mouse to create a selection.</div>
                    <div class="selection-active">
                        <table>
                        <tr><td>From:</td><td class="selection-start-time"></td></tr>
                        <tr><td>To:</td><td class="selection-stop-time"></td></tr>
                        </table>
                        <div class="selection-diff-container"></div>
                        <div class="selection-extra-info"></div>
                    </div>
                </div>

            </div>`;

        const allSeriesYMin = d3.min(allSeries, serie => d3.min(serie.data, datapoint => datapoint.y));
        const allSeriesYMax = d3.max(allSeries, serie => d3.max(serie.data, datapoint => datapoint.y));
        const allSeriesYSpan = allSeriesYMax - allSeriesYMin;

        const graph = this.graph = new Rickshaw.Graph( {
                element: rootElement.querySelector(".chart-draw-area"),
                width: 1100,
                height: 500,
                interpolation: "linear",
                stack: false,
                series: allSeries
        } );
        graph.setRenderer('line');
        graph.render();

        const distanceFurthestFromZero = Math.max(Math.abs(allSeriesYMin), Math.abs(allSeriesYMax));
        rootElement.querySelector('.btn-fixed-zero').addEventListener('click', (ev) => {
            params["y-axis-scaling"] = "fixed-zero";
            reloadWithNewUrlParams(params);
        });

        rootElement.querySelector('.btn-fixed').addEventListener('click', (ev) => {
            params["y-axis-scaling"] = "fixed";
            reloadWithNewUrlParams(params);
        });

        rootElement.querySelector('.btn-rescale').addEventListener('click', (ev) => {
            params["y-axis-scaling"] = "rescale";
            reloadWithNewUrlParams(params);
        });

        const allYAxisScalingMethods = ["fixed-zero", "fixed", "rescale"];
        if (allYAxisScalingMethods.indexOf(params["y-axis-scaling"]) == -1) {
            params["y-axis-scaling"] = "fixed-zero";
        }
        document.querySelector('.btn-' + params['y-axis-scaling']).checked = true;
        switch (params["y-axis-scaling"]) {
            case "fixed-zero":
                graph.configure({
                    min: Math.min(allSeriesYMin, 0),
                    max: Math.max(allSeriesYMax + 0.1*distanceFurthestFromZero, 0),
                });
                graph.render();
                break;
            case "fixed":
                graph.configure({
                    min: allSeriesYMin - 0.1*allSeriesYSpan,
                    max: allSeriesYMax + 0.1*allSeriesYSpan,
                });
                graph.render();
                break;
            case "rescale":
                graph.configure({
                    min: "auto",
                    max: undefined,
                });
                graph.render();
                break;
        }

        if (allSeries.length > 1) {
            rootElement.querySelector('.legend-help-text').style.display = "block";
        }

        function timestampToDateString(x) {
            return (new Date(x*1000)).toISOString().substring(0, 10)
        }

        var xAxis = new Rickshaw.Graph.Axis.X({
            graph: graph,
            tickFormat: timestampToDateString,
            orientation: "bottom",
            pixelsPerTick: 120,
            element: rootElement.querySelector('.x-axis'),
        });
        xAxis.render();

        const yAxis = new Rickshaw.Graph.Axis.Y({
            graph: graph,
            orientation: 'left',
            tickFormat: (v) => v.toLocaleString(),
            element: rootElement.querySelector('.y-axis'),
        });
        yAxis.render();

        const legend = new Rickshaw.Graph.Legend({
            element: rootElement.querySelector('.legend'),
            graph: graph
        });

        const shelving = new Rickshaw.Graph.Behavior.Series.Toggle({
            graph: graph,
            legend: legend
        });

        const hoverDetail = new Rickshaw.Graph.HoverDetail({
            graph: graph,
            xFormatter: opts.xFormatter,
            yFormatter: function(y) { return y.toLocaleString() }
        });

        const rangeSlider = new Rickshaw.Graph.RangeSlider({
            graph: graph,
            element: rootElement.querySelector('.range-slider')
        });

        const annotator = new Rickshaw.Graph.Annotate({
            graph: graph,
            element: rootElement.querySelector('.annotation-timeline')
        });

        const annotations = all_chart_data[params["chart"]]["chart_annotations"]
        for (let timestamp in annotations) {
            annotator.add(timestamp, timestampToDateString(timestamp) + ": " + annotations[timestamp]);
        }
        annotator.update();

        const chartDrawArea = rootElement.querySelector(".chart-draw-area");
        chartDrawArea.style.position = "relative";
        const drawAreaBoundingRect = this.drawAreaBoundingRect = chartDrawArea.getBoundingClientRect();
        const selectionOutline = chartDrawArea.appendChild(document.createElement("div"));
        selectionOutline.className += "selection-outline";
        selectionOutline.style.position = "absolute";
        selectionOutline.style.border = "1px dashed black";
        selectionOutline.style['pointer-events'] = "none";
        let isMouseDown = false;
        let selStartX;

        chartDrawArea.addEventListener("mousedown", (ev) => {
            selStartX = ev.clientX;
            selectionOutline.style.left = ev.clientX - drawAreaBoundingRect.left;
            selectionOutline.style.top = 0;
            selectionOutline.style.width = 0;
            selectionOutline.style.height = chartDrawArea.clientHeight - 2;
            isMouseDown = true;
            // Selection should remain hidden until cursor has moved at least 10 px.
            hideSelection();
            chartDrawArea.querySelector(".detail").style.display = "none";
            ev.preventDefault();
        });
        chartDrawArea.addEventListener("mousemove", (ev) => {
            const selEndX = ev.clientX;
            if (isMouseDown) {
                const selectionWidth = Math.abs(selEndX - selStartX);
                selectionOutline.style.left = Math.min(selStartX, selEndX) - drawAreaBoundingRect.left;
                selectionOutline.style.width = selectionWidth;

                this.updateSelectionInfo(selStartX, selEndX);

                if (selectionWidth > 10) {
                    selectionOutline.style.display = "block";
                }
            }
        });
        chartDrawArea.addEventListener("mouseup", (ev) => {
            if (isMouseDown) {
                isMouseDown = false;
                const selEndX = ev.clientX;
                const selectionWidth = Math.abs(selEndX - selStartX);
                chartDrawArea.querySelector(".detail").style.display = "block";
                if (selectionWidth < 10) {
                    // Classify this "drag" as a "click" instead and remove selection
                    hideSelection();
                }
            }
        });
        chartDrawArea.addEventListener("mouseleave", (ev) => {
            if (isMouseDown) {
                isMouseDown = false;
            }
        });
        rangeSlider.onSlide(() => {
            hideSelection();
        });
        function hideSelection() {
            selectionOutline.style.display = "none";
            rootElement.querySelector(".selection-inactive").style.display = "block";
            rootElement.querySelector(".selection-active").style.display = "none";
        }
        hideSelection();
    }

    updateSelectionInfo(selStartX, selEndX) {
        const selLeft = Math.min(selStartX, selEndX);
        const selRight = Math.max(selStartX, selEndX);
        const from = this.getTimeAtChartXCoord(selLeft);
        const fromTimestamp = this.graph.x.invert(selLeft - this.drawAreaBoundingRect.left);
        const to = this.getTimeAtChartXCoord(selRight);
        const toTimestamp = this.graph.x.invert(selRight - this.drawAreaBoundingRect.left);
        this.rootElement.querySelector(".selection-inactive").style.display = "none";
        this.rootElement.querySelector(".selection-active").style.display = "block";

        document.querySelector(".selection-start-time").innerText = from.toISOString().replace("T", " ").slice(0, 16);
        document.querySelector(".selection-stop-time").innerText = to.toISOString().replace("T", " ").slice(0, 16);

        const selDiffContainer = this.rootElement.querySelector(".selection-diff-container");
        selDiffContainer.innerHTML = '';
        [...allSeries].forEach(series => {
            const [firstDatapointInRange, lastDatapointInRange] = this.getFirstAndLastDatapointInRange(fromTimestamp, toTimestamp, series);
            if (firstDatapointInRange) {
                const diffAbsoluteValue = lastDatapointInRange.y - firstDatapointInRange.y;
                let diffPrefix;
                if (diffAbsoluteValue >= 0) {
                    diffPrefix = '+';
                } else {
                    diffPrefix = '';
                }
                const diffPercentageValue = (100*lastDatapointInRange.y/firstDatapointInRange.y - 100).toFixed(2);
                const diffPercentageStr = diffPrefix + diffPercentageValue;
                const diffAbsoluteStr = diffPrefix + diffAbsoluteValue.toLocaleString();

                selDiffContainer.innerHTML += `
                    <div class="diff-wrapper-outer">
                        <span class="colorbox" style="background: ${series.color}"></span>
                        <div class="diff-wrapper-inner">
                            <div>${series.name}</div>
                            <div class=".diff-value">${diffPercentageStr}% (${diffAbsoluteStr})</div>
                            <div class="diff-details">
                                <div><span>From value: </span><span>${firstDatapointInRange.y}</span></div>
                                <div><span>To value: </span><span>${lastDatapointInRange.y}</span></div>
                            </div>
                        </div>
                    </div>`;
                selDiffContainer.querySelectorAll(".diff-wrapper-outer").forEach((diffWrapper) => {
                    const diffDetails = diffWrapper.querySelector(".diff-details");
                    diffDetails.style.display = "none";
                    diffWrapper.addEventListener("click", () => {
                        diffDetails.style.display = diffDetails.style.display != "block" ? "block" : "none";
                    });
                });
            }
        });

        this.onRangeSelectedCallbacks.forEach((callback) => {
            callback(fromTimestamp, toTimestamp);
        });
    }

    onRangeSelected(callback) {
        this.onRangeSelectedCallbacks.push(callback);
    }

    getTimeAtChartXCoord(x) {
        return new Date(1000 * this.graph.x.invert(x - this.drawAreaBoundingRect.left));
    }

    getFirstAndLastDatapointInRange(timestampFrom, timestampTo, series) {
        let firstDatapointInRange = undefined;
        let lastDatapointInRange = undefined;
        for (var datapoint of series.data) {
            const x = datapoint.x;
            const y = datapoint.y;
            if (timestampFrom < x && x < timestampTo) {
                if (!firstDatapointInRange || x - timestampFrom < firstDatapointInRange.x - timestampFrom) {
                    firstDatapointInRange = datapoint;
                }
                if (!lastDatapointInRange || timestampTo - x < timestampTo - lastDatapointInRange.x) {
                    lastDatapointInRange = datapoint;
                }
            }
        }
        return [firstDatapointInRange, lastDatapointInRange];
    }
}
