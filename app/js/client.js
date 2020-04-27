//ON THE BROWSER
//---------------------------------
function new_XMLHttpRequest() {
    let ref = null;
    if (window.XMLHttpRequest) {
        ref = new XMLHttpRequest();
    } else if (window.ActiveXObject) { // Older IE.
        ref = new ActiveXObject("MSXML2.XMLHTTP.3.0");
    }
    if (!ref) {
        throw {status: 505, responseText: 'Failure to create XMLHttpRequest'};
    }
    return ref;
}

//---------------------------------
function ajaxGetJson(url, callback) {

    if (typeof callback !== 'function') {
        throw('callback should be a function(err,data)');
    }

    try {
        const xmlhttp = new_XMLHttpRequest();
        xmlhttp.onreadystatechange = function() {
            if (xmlhttp.readyState === 4) {
                if (xmlhttp.status !== 200) {
                    return callback(new Error("status:" + xmlhttp.status + " " + xmlhttp.statusText));
                }
                let response;
                try {
                    response = JSON.parse(xmlhttp.responseText); // parseo json
                } catch (ex) {
                    return callback(new Error(ex.message + '\n' + xmlhttp.responseText.substr(0, 600))); // data no era JSON
                }

                if (response.err) return callback(response.err); // server err
                return callback(null, response.data); // callback OK
            }
        };

        xmlhttp.open("GET", url, true); //async
        xmlhttp.setRequestHeader('content-type', 'applicattion/json');
        xmlhttp.send();
        return xmlhttp;
    }
    catch (e) {
        //call the callback on next chance
        return setTimeout(function(){callback(e, null)},0);
    }
}

var reqMonths = [];
var oEvents = [];
var oEventsCalendar = [];
const guid = genGuid();

function isDateRequested(idate){
    //let date = idate.toISOString();
    let month = idate.getMonth() + 1; //date.substr(5,2).match(/\d{1,2}/));
    let year = idate.getFullYear();//date.substring(0,4).match(/\d{4}/));

    let inMonths = reqMonths.find(function (element) {
        return element.month === month && element.year === year;
    });

    if(inMonths === undefined) {
        reqMonths.push({
            month: month,
            year: year
        });
        reqMonths.sort(function (a, b){
            let date_a = new Date(a.year + '-' + a.month + '-01');
            let date_b = new Date(b.year + '-' + b.month + '-01');
            return date_a.getTime() - date_b.getTime();
        });
        return false;
    }
    return true;
}

function getReqDates(start, end){
    var startdate = new Date(start.toISOString()); // + 'T00:00:00.000Z'
    var enddate = new Date(end.toISOString());

    //let betweenMonth = new Date(startdate.getTime()).next().month().getMonth();
    var betweenMonth = (new Date(start.toISOString())).next().month().getMonth() + 1;

    if(betweenMonth.toString().length === 1){
        betweenMonth = '0' + betweenMonth;
    }
    let betweenYear = betweenMonth === '03' ? enddate.getFullYear() : startdate.getFullYear();
    let betweenDate = betweenYear + '-' + betweenMonth + '-01';
    let between = new Date(betweenDate);

    var months = [startdate, between, enddate];
    var req_events = [];
    var req_months = [];
    var filtered_months = [];

    for(var i = 0; i < months.length; i++){
        if(isDateRequested(months[i]) === true){
            req_months.push(months[i]);
        } else {
            filtered_months.push(months[i]);
        }
    }
    filtered_months.sort(function (a, b){
        return a.getTime() - b.getTime();
    });

    //get previous events
    if(filtered_months.length === 0){
        return {
            start : undefined,
            end : undefined
            //events : req_events
        };
    } else if(filtered_months.length === 1){
        return {
            start : filtered_months[0],
            end : filtered_months[0]
            //events : req_events
        };
    } else {
        return {
            start : filtered_months[0],
            end : filtered_months[filtered_months.length - 1]
            //events: req_events
        };
    }
}

function genGuid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}


function uniqueEvents (oArr) {
    var  oUniqArr = [];
    var already_in;

    for(var i = 0; i < oArr.length; i++){
        var oArrDouble = oArr.filter(function (el, j) {
            return oArr[i].details === el.details;

        });
        already_in = false;
        for(var x=0; x < oUniqArr.length; x++){
            if(oUniqArr[x].details == oArr[i].details){
                already_in = true;
                break;
            }
        }
        if(already_in === false){
            oUniqArr.push(oArrDouble[0]);
        }
    }
    return oUniqArr;
}

function uniqueEventsOnly (oArrSrc, oArrCmp) {
    var oArrNoneSrc = oArrSrc.map(function (el) {
        var oNew = $.extend(true,{},el);
        delete oNew.id;
        delete oNew._id;
        return oNew;
    });

    var oArrNoneCmp = oArrCmp.map(function (el) {
        var oNew = $.extend(true,{},el);
        delete oNew.id;
        delete oNew._id;
        return oNew;
    });

    var oUniqArr = [];

    for(var i = 0; i < oArrSrc.length; i++){
        var exist = false;
        for(var j = 0; j < oArrCmp.length; j++){
            if(_.isEqual(oArrNoneSrc[i], oArrNoneCmp[j]) === true){
                exist = true;
                break;
            }
        }
        if(exist === false){
            oUniqArr.push(oArrSrc[i]);
        }
    }
    return oUniqArr;
}

function uniqueArray (arrArg) {
    return arrArg.filter((elem, pos, arr) => {
        return arr.indexOf(elem) == pos;
    });
}

function getLoaded(){
    oEventsCalendar = $('#calendar').fullCalendar('clientEvents');
    $('#calendar').fullCalendar('rerenderEvents');
    $('#calendar').fullCalendar('refetchEvents');
}

function rerender(){
    $('#calendar').fullCalendar('removeEvents');
    oEvents = uniqueEvents(oEvents);//uniqueArray(oEvents);
    $('#calendar').fullCalendar('renderEvents', oEvents, true);
    $('#calendar').fullCalendar('rerenderEvents');
}

function createGraphic(json){
    //moment.unix(in_data.content.graph[0][65].t).format("YYYY-MM-DD")
    var oLabels = [];
    var oPositiv = [];
    var oNegativ = [];
    var oForecast = [];
    var timeFormat = 'MM/DD/YYYY HH:mm';

    json.forEach(function(el){
        oLabels.push(moment.unix(el.t).format(timeFormat));
        if(el.act_num >= el.for_num){
            oPositiv.push(el.act_num);
            oNegativ.push(0);
            oForecast.push(el.for_num);
        } else {
            oPositiv.push(0);
            oNegativ.push(el.act_num);
            oForecast.push(el.for_num);
        }
    });

    var color = Chart.helpers.color;

    return {
        type: 'bar',
        data: {
            labels: oLabels,
            datasets: [{
                type: 'bar',
                label: 'Negative',
                backgroundColor: color(window.chartColors.red).alpha(0.5).rgbString(),
                borderColor: window.chartColors.red,
                data: oNegativ,
            }, {
                type: 'bar',
                label: 'Positive',
                backgroundColor: color(window.chartColors.blue).alpha(0.5).rgbString(),
                borderColor: window.chartColors.blue,
                data: oPositiv,
            }, {
                type: 'line',
                label: 'Forecast',
                backgroundColor: color(window.chartColors.green).alpha(0.5).rgbString(),
                borderColor: window.chartColors.green,
                fill: false,
                data: oForecast,
            }]
        },
        options: {
            title: {
                text: 'Time Scale'
            },
            scales: {
                xAxes: [{
                    type: 'time',
                    display: true,
                    time: {
                        format: timeFormat,
                        // round: 'day'
                    }
                }],
            },
        }
    };
}

function addMsgBoxContent(id, text, value, bAdd=false){
    let rows = Math.ceil(value.length / 55.0);
    //for="' + id + '"
    return bAdd === true || value ?
        '<label>' + text + ': </label>' +
        (value.substr(0,8) === '<a href=' ? value + '<br>':
            (rows === 1) ? '<input type="text" id="' + id + '" value="' + value + '" readonly><br>' :
        '<textarea id="' + id + '" rows="' + rows.toString() + '" cols="60">' + value + '</textarea><br>')
        : ''; //
}

function buildGraphic() {
    if(window.oChart){
        window.oChart.update();
    } else {
        var ctx = document.getElementById('idChart').getContext('2d');
        window.oChart = new Chart(ctx, window.oConfig);
    }
}

$(document).ready(function() {
    let defaultDate = (new Date()).toISOString().match(/.+?(?=T)/)[0];
    vex.defaultOptions.className = 'vex-theme-top'; //'vex-theme-os';
    window.chartColors = {
        red: 'rgb(255, 99, 132)',
        orange: 'rgb(255, 159, 64)',
        yellow: 'rgb(255, 205, 86)',
        green: 'rgb(75, 192, 192)',
        blue: 'rgb(54, 162, 235)',
        purple: 'rgb(153, 102, 255)',
        grey: 'rgb(231,233,237)'
    };

    var oLoader = $('body').loadingIndicator({
        useImage: false,
        loadingClass: "loader",
        wrapperClass: "loading-indicator-wrapper"
    }).data("loadingIndicator");
    oLoader.hide();

    $('#calendar').fullCalendar({
        header: {
            left: 'prev,next today',
            center: 'title',
            right: 'month,agendaWeek,agendaDay,listWeek'
        },
        defaultDate: defaultDate,
        navLinks: true, // can click day/week names to navigate views
        editable: true,
        eventLimit: true, // allow "more" link when too many events
        lazyFetching: true,
        eventSources: [
            {
                id: 'default',
                events: function(start, end, timezone, callback) {
                    oEventsCalendar = $('#calendar').fullCalendar('clientEvents');
                    var oDates = getReqDates(start, end);
                    if(oDates.start === undefined) {
                        var date = $("#calendar").fullCalendar('getDate');
                        callback([]);
                        _.defer(rerender);
                        return;
                    }

                    let vUrl = '/ff/?';
                    vUrl += 'start=' + oDates.start.toISOString().substr(0,10) + '&';
                    vUrl += 'end=' + oDates.end.toISOString().substr(0,10);

                    oLoader.show();
                    ajaxGetJson(vUrl, function(err, in_data){
                        if(err) {
                            console.log(err.message);
                            return;
                        }

                        let data = in_data.content;
                        var req_events = [];

                        for (let i = 0; i < data.length; i++){

                            let id = i.toString();
                            let rec = data[i];
                            let start = rec.date;

                            let vAllDay = false;


                            if(rec.time.match(/^Day/) !== null ||
                                rec.time === 'All Day' ||
                                rec.time === 'Tentative') {

                                vAllDay = true;
                                start += 'T00:00:00';
                            } else {
                                start += 'T' + (rec.time.length > 4 ? rec.time : '0' + rec.time) + ':00';
                            }
                            start = moment.tz(start, "America/New_York").clone().local().toISOString();

                            switch (rec.impact){
                                case "high":
                                    vColor = "#ea2577";
                                    break;
                                case "medium":
                                    vColor = "#0000ff";
                                    break;
                                case "low":
                                    vColor = "#979838";
                                    break;
                                case "holiday":
                                default:
                                    vColor = "#949292";
                                    break;
                            }

                            req_events.push({
                                id: id,
                                title: rec.title,
                                start: start,
                                details: rec.details,
                                symbol: rec.symbol,
                                actual: rec.actual,
                                forecast: rec.forecast,
                                previous: rec.previous,
                                impact : rec.impact,
                                allDay: vAllDay,
                                color: vColor
                            });
                        }

                        var oNewEvents = uniqueEventsOnly(req_events, oEvents);
                        oEvents = oEvents.concat(oEvents, oNewEvents);
                        oEvents = uniqueArray(oEvents);
                        callback(oNewEvents);
                        _.defer(rerender);
                        oLoader.hide();
                    });
                }
            }
        ],
        eventDataTransform: function(rec){
            return rec;
        },
        eventAfterAllRender: function(view){
            oEventsCalendar = $('#calendar').fullCalendar('clientEvents');
        },
        eventClick: function (calEvent, jsEvent, view) {
            let vUrl = '/event/?';
            vUrl += 'datetime=' + calEvent.start.toISOString() + '&';
            vUrl += 'details=' + calEvent.details;

            ajaxGetJson(vUrl, function(err, in_data){
                if(err) {
                    vex.dialog.alert('Error:' + err.message);
                    return;
                }
                var oInput = [  addMsgBoxContent("idStartDateTime", "Time", calEvent.start.format("DD-MM-YYYY hh:mm:ss A")),
                                addMsgBoxContent("idSymbol", "Symbol", calEvent.symbol),
                                addMsgBoxContent("idActual", "Actual", calEvent.actual),
                                addMsgBoxContent("idForecast", "Forecast", calEvent.forecast),
                                addMsgBoxContent("idPrevious", "Previous", calEvent.previous)];

                in_data.content.descr.forEach((el) => {
                    oInput.push(addMsgBoxContent("id" + el.header, el.header, el.description));
                });

                var oButtons = [ $.extend({}, vex.dialog.buttons.YES, {
                    //className: 'vex-dialog-button-primary-horizontal',
                    text: 'OK', click: function(e) {
                        this.value = 'close';
                        this.close();
                    }}) ];

                if(in_data.content.graph.length > 0 && in_data.content.graph[0].length > 0){
                    oInput.push('<canvas id="idChart"></canvas>'); //width="100%" height="400"
                    window.oConfig = createGraphic(in_data.content.graph[0]);
                    _.defer(buildGraphic);
                }

                vex.dialog.open({
                    message: calEvent.title,
                    input: oInput.join(''),
                    buttons: oButtons,
                    callback: function(value){
                        if(value === 'close'){
                            window.oChart = undefined;
                        }
                    }
                });
            });
        }
    });

    $('.fc-prev-button').click(function(){
        getLoaded();
    });

    $('.fc-next-button').click(function(){
        getLoaded();
    });
});