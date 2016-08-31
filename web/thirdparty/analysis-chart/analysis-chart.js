class AnalysisChart {
    constructor(element, data, opts) {
        this.onRangeSelectedCallbacks = [];

        element.innerHTML = `
            <div id="chart_container">
                    <div id="y_axis"></div>
                    <div id="chart"></div>
                    <div id="x_axis"></div>
                    <div id="annotation_timeline"></div>
                    <div id="range_slider"></div>
            </div>
            <div id="rightColumn">
                <div id="legend"></div>
                <div id="optionsPanel">
                    <div id="legendHelpText">
                        <span id="legendHelpArrow">&#x2B11;</span> <span>too much clutter? uncheck to temporarily hide metrics</span>
                    </div>
                    <div id="scalingButtonsContainer">
                        <input type="radio" name="y-axis-scaling" id="btnFixedZero" />
                        <label for="btnFixedZero">Fixed Y-axis (fit to data, always include zero)</label>

                        <input type="radio" name="y-axis-scaling" id="btnFixed" />
                        <label for="btnFixed">Fixed Y-axis (fit to data, with padding)</label>

                        <input type="radio" name="y-axis-scaling" id="btnRescale" />
                        <label for="btnRescale">Rescale Y-axis to currently visible data</label>
                    </div>
                </div>
                <div>
                    <div id="selInactive">Nothing selected. Drag-select a part of the chart using the mouse to create a selection.</div>
                    <div id="selActive">
                        <table>
                        <tr><td>From:</td><td id="selLeftTime"></td></tr>
                        <tr><td>To:</td><td id="selRightTime"></td></tr>
                        </table>
                        <div id="selDiffContainer"></div>
                        <div id="selExtraInfo"></div>
                    </div>
                </div>

            </div>`;

        const allSeriesYMin = d3.min(allSeries, serie => d3.min(serie.data, datapoint => datapoint.y));
        const allSeriesYMax = d3.max(allSeries, serie => d3.max(serie.data, datapoint => datapoint.y));
        const allSeriesYSpan = allSeriesYMax - allSeriesYMin;

        const graph = this.graph = new Rickshaw.Graph( {
                element: document.querySelector("#chart"),
                width: 1100,
                height: 500,
                interpolation: "linear",
                stack: false,
                series: allSeries
        } );
        graph.setRenderer('line');
        graph.render();

        const distanceFurthestFromZero = Math.max(Math.abs(allSeriesYMin), Math.abs(allSeriesYMax));
        $("#btnFixedZero").click(function (e) {
            params["y-axis-scaling"] = "FixedZero";
            reloadWithNewUrlParams(params);
        });

        $("#btnFixed").click(function (e) {
            params["y-axis-scaling"] = "Fixed";
            reloadWithNewUrlParams(params);
        });

        $("#btnRescale").click(function (e) {
            params["y-axis-scaling"] = "Rescale";
            reloadWithNewUrlParams(params);
        });

        const allYAxisScalingMethods = ["FixedZero", "Fixed", "Rescale"];
        if (allYAxisScalingMethods.indexOf(params["y-axis-scaling"]) == -1) {
            params["y-axis-scaling"] = "FixedZero";
        }
        $("#btn" + params["y-axis-scaling"]).attr("checked", "true");
        switch (params["y-axis-scaling"]) {
            case "FixedZero":
                graph.configure({
                    min: Math.min(allSeriesYMin, 0),
                    max: Math.max(allSeriesYMax + 0.1*distanceFurthestFromZero, 0),
                });
                graph.render();
                break;
            case "Fixed":
                graph.configure({
                    min: allSeriesYMin - 0.1*allSeriesYSpan,
                    max: allSeriesYMax + 0.1*allSeriesYSpan,
                });
                graph.render();
                break;
            case "Rescale":
                graph.configure({
                    min: "auto",
                    max: undefined,
                });
                graph.render();
                break;
        }

        if (allSeries.length > 1) {
            $('#legendHelpText').show();
        }

        function timestampToDateString(x) {
            return (new Date(x*1000)).toISOString().substring(0, 10)
        }

        var x_axis = new Rickshaw.Graph.Axis.X( {
            graph: graph,
            tickFormat: timestampToDateString,
            orientation: "bottom",
            pixelsPerTick: 120,
            element: document.getElementById('x_axis'),
        } );
        x_axis.render();

        const y_axis = new Rickshaw.Graph.Axis.Y( {
                graph: graph,
                orientation: 'left',
                tickFormat: (v) => v.toLocaleString(),
                element: document.getElementById('y_axis'),
        } );
        y_axis.render();

        const legend = new Rickshaw.Graph.Legend( {
                element: document.querySelector('#legend'),
                graph: graph
        } );

        const shelving = new Rickshaw.Graph.Behavior.Series.Toggle({
            graph: graph,
            legend: legend
        });

        const hoverDetail = new Rickshaw.Graph.HoverDetail( {
            graph: graph,
            xFormatter: opts.xFormatter,
            yFormatter: function(y) { return y.toLocaleString() }
        } );

        const slider = new Rickshaw.Graph.RangeSlider({
            graph: graph,
            element: document.querySelector('#range_slider')
        });

        const annotator = new Rickshaw.Graph.Annotate({
            graph: graph,
            element: document.querySelector('#annotation_timeline')
        });

        const annotations = all_chart_data[params["chart"]]["chart_annotations"]
        for (let timestamp in annotations) {
            annotator.add(timestamp, timestampToDateString(timestamp) + ": " + annotations[timestamp]);
        }
        annotator.update();

        const chartElement = document.querySelector("#chart");
        chartElement.style.position = "relative";
        const chartElementBoundingRect = this.chartElementBoundingRect = chartElement.getBoundingClientRect();
        const selectionOutline = chartElement.appendChild(document.createElement("div"));
        selectionOutline.className += "selection-outline";
        selectionOutline.style.position = "absolute";
        selectionOutline.style.border = "1px dashed black";
        selectionOutline.style['pointer-events'] = "none";
        let isMouseDown = false;
        let selStartX;

        chartElement.addEventListener("mousedown", (ev) => {
            selStartX = ev.clientX;
            selectionOutline.style.left = ev.clientX - chartElementBoundingRect.left;
            selectionOutline.style.top = 0;
            selectionOutline.style.width = 0;
            selectionOutline.style.height = chartElement.clientHeight - 2;
            isMouseDown = true;
            // Selection should remain hidden until cursor has moved at least 10 px.
            hideSelection();
            chartElement.querySelector(".detail").style.display = "none";
            ev.preventDefault();
        });
        chartElement.addEventListener("mousemove", (ev) => {
            const selEndX = ev.clientX;
            if (isMouseDown) {
                const selectionWidth = Math.abs(selEndX - selStartX);
                selectionOutline.style.left = Math.min(selStartX, selEndX) - chartElementBoundingRect.left;
                selectionOutline.style.width = selectionWidth;

                this.updateSelectionInfo(selStartX, selEndX);

                if (selectionWidth > 10) {
                    selectionOutline.style.display = "block";
                }
            }
        });
        chartElement.addEventListener("mouseup", (ev) => {
            if (isMouseDown) {
                isMouseDown = false;
                const selEndX = ev.clientX;
                const selectionWidth = Math.abs(selEndX - selStartX);
                chartElement.querySelector(".detail").style.display = "block";
                if (selectionWidth < 10) {
                    // Classify this "drag" as a "click" instead and remove selection
                    hideSelection();
                }
            }
        });
        chartElement.addEventListener("mouseleave", (ev) => {
            if (isMouseDown) {
                isMouseDown = false;
            }
        });
        slider.onSlide(() => {
            hideSelection();
        });
        function hideSelection() {
            selectionOutline.style.display = "none";
            document.querySelector("#selInactive").style.display = "block";
            document.querySelector("#selActive").style.display = "none";
        }
        hideSelection();
    }

    updateSelectionInfo(selStartX, selEndX) {
        const selLeft = Math.min(selStartX, selEndX);
        const selRight = Math.max(selStartX, selEndX);
        const from = this.getTimeAtChartXCoord(selLeft);
        const fromTimestamp = this.graph.x.invert(selLeft - this.chartElementBoundingRect.left);
        const to = this.getTimeAtChartXCoord(selRight);
        const toTimestamp = this.graph.x.invert(selRight - this.chartElementBoundingRect.left);
        document.querySelector("#selInactive").style.display = "none";
        document.querySelector("#selActive").style.display = "block";

        document.querySelector("#selLeftTime").innerText = from.toISOString().replace("T", " ").slice(0, 16);
        document.querySelector("#selRightTime").innerText = to.toISOString().replace("T", " ").slice(0, 16);

        const selDiffContainer = document.querySelector("#selDiffContainer");
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
                    <div class="diffWrapper">
                        <span class="colorbox" style="background: ${series.color}"></span>
                        <div class="diffWrapperRight">
                            <div>${series.name}</div>
                            <div class="diffValue">${diffPercentageStr}% (${diffAbsoluteStr})</div>
                            <div class="diffDetails">
                                <div><span>From value: </span><span>${firstDatapointInRange.y}</span></div>
                                <div><span>To value: </span><span>${lastDatapointInRange.y}</span></div>
                            </div>
                        </div>
                    </div>`;
                selDiffContainer.querySelectorAll(".diffWrapper").forEach((diffWrapper) => {
                    const diffDetails = diffWrapper.querySelector(".diffDetails");
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
        return new Date(1000 * this.graph.x.invert(x - this.chartElementBoundingRect.left));
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
