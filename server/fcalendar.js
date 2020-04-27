const { JsonDB } = require("node-json-db");
const { Config } = require('node-json-db/dist/lib/JsonDBConfig');

const cheerio = require('cheerio');
const fs = require("fs");
const rp = require('request-promise');
const Promise = require('bluebird');
const xml2js = require('xml2js-es6-promise');

const db_events = new JsonDB(new Config('db/events.json', true, false));
const db_months = new JsonDB(new Config('db/months.json', false, false));

require('datejs');

const {createLogger, format, transports} = require('winston');
const {combine, timestamp, label, printf} = format;

const logger = createLogger({
    level: 'info',
    format: combine(
        label({label: 'fcalendar'}),
        timestamp(),
        printf(info => {
            return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
        })
    ),
    transports: [
        new transports.File({
            filename: 'log/error.log',
            level: 'error',
            timestamp: true

        }),
        new transports.File({
            filename: 'log/combined.log',
            timestamp: true
            //zippedArchive: true
        }),
        new transports.Console()
    ]
});


const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const c_expirationTime = 86400000; //1 day
const c_time = 'T00:00:00';

function convertTo24Hour(time) {
    let hours = parseInt(time.substr(0, 2));
    if (time.indexOf('am') !== -1 && hours === 12) {
        time = time.replace('12', '0');
    }
    if (time.indexOf('pm') !== -1 && hours < 12) {
        time = time.replace(hours, (hours + 12));
    }
    return time.replace(/(am|pm)/, '');
}

function trim_space(str) {
    str = str.replace(/^\s+/, '');
    for (let i = str.length - 1; i >= 0; i--) {
        if (/\S/.test(str.charAt(i))) {
            str = str.substring(0, i + 1);
            break;
        }
    }
    return str;
}

function createDayUrl(idate) {
    //https://www.forexfactory.com/calendar.php?day=dec25.2017
    let url = 'https://www.forexfactory.com/calendar.php?day=';
    let daysInMonth = new Date(idate.year, idate.month, 0).getDate();
    return Array.from({length: daysInMonth}, (v, i) => url + monthNames[idate.month - 1] + (i + 1) + '.' + idate.year);
}

function extractDate(time) {
    if (!time) return undefined;

    return {
        month: parseInt(time.match(/\-(.*?)\-/)[1]), // /\-(.*?)\-/
        year: parseInt(time.substring(0, 4)),
        date: new Date(time.toString() + c_time)
    };
}

function extractDates(time) {
    let start = extractDate(time[0]);
    let end = extractDate(time[1]);

    let betweenMonth = (start.date.next().month().getMonth() + 1).toString();//(start.month + 1) % 12 + 1;

    if (betweenMonth.toString().length === 1) {
        betweenMonth = '0' + betweenMonth;
    }
    let betweenYear = betweenMonth === '01' ? end.year : start.year;
    let betweenDate = betweenYear + '-' + betweenMonth + '-01';
    let between = extractDate(betweenDate);

    let dates = [start];
    if (!(between.date.getTime() === start.date.getTime() ||
        between.date.getTime() === end.date.getTime())) {
        dates.push(between);
    }
    dates.push(end);
    return dates;
}


function ff_event(oParams, callback) {
    try {
        let requests = [];
        let eText = [];
        let eGraphic = [];

        //text
        let oDetail;
        try {
            oDetail = db_events.getData('/' + oParams.details);
            //let now = new Date();
            let expiration = new Date(oDetail.expiration);

            if(checkExpiration(expiration)){
                logger.info(oParams.details + ": read from db");
                callback(null, oDetail);
                return;
            }
            /*if ((expiration.getFullYear() === now.getFullYear() && expiration.getMonth() < now.getMonth()) ||
                (expiration.getFullYear() < now.getFullYear()) ||
                (expiration.getFullYear() === now.getFullYear() && expiration.getMonth() >= now.getMonth() &&
                    now.getTime() - expiration.getTime() <= c_expirationTime) ||
                (expiration.getFullYear() > now.getFullYear() &&
                    now.getTime() - expiration.getTime() <= c_expirationTime)) {

                logger.info(oParams.details + ": read from db");
                callback(null, oDetail);
                return;
            }*/
        } catch (err) { /* nothing to do */
        }

        requests.push(rp({
            uri: 'https://www.forexfactory.com/flex.php?do=ajax&contentType=Content&flex=calendar_mainCal&details=' + oParams.details
        }).then(response => {
            return xml2js(response);
        }).then(json => {
            extractEventDetailText(json.flex, eText);
        }));

        //json
        requests.push(rp({
            uri: 'https://www.forexfactory.com/calendardata.php?chart=eco&json=1&limit=200&eventid=' + oParams.details + '&offset=-4&dst=1'
        }).then(response => {
            extractEventDetailJson(response, eGraphic);
        }));

        Promise.all(requests)
            .catch(err => {
                logger.error(err.message);
                callback(err, null);
            })
            .finally(function () {
                let now = new Date();
                oDetail = {
                    expiration: now,
                    descr: eText,
                    graph: eGraphic
                };
                db_events.push('/' + oParams.details, oDetail);
                logger.info(oParams.details + ": responses finished");
                callback(null, oDetail);
            });
    } catch (err) {
        logger.error(err.message);
        callback(err, null);
    }
}

function getMonthYear(month, year) {
    return year + '-' +
        (month.toString().length === 1 ? '0' + month.toString() : month.toString());
}

function filterNews(calendar) {
    let contents = fs.readFileSync("./db/news.json");
    let filter = JSON.parse(contents);
    return calendar.filter((el) => {
        return filter[el.title] ? true : false;
    });
}

function checkExpiration(expiration) {
    let now = new Date();
    if ((expiration.getFullYear() === now.getFullYear() && expiration.getMonth() < now.getMonth()) ||
        (expiration.getFullYear() < now.getFullYear()) ||
        (expiration.getFullYear() === now.getFullYear() && expiration.getMonth() >= now.getMonth() &&
            now.getTime() - expiration.getTime() <= c_expirationTime) ||
        (expiration.getFullYear() > now.getFullYear() &&
            now.getTime() - expiration.getTime() <= c_expirationTime)) {

        return true;
    } else {
        return false;
    }
}
/**
 * Extract list of events
 * @param time
 * @param callback
 */
function ff_calendar(time, callback) {
    let dates = extractDates([time.start, time.end]);

    let vUrl = [];
    let calendar = [];

    dates.forEach((el) => {
        let monthYear = getMonthYear(el.month, el.year);
        try {
            let oMonth = db_months.getData('/' + monthYear);
            let now = new Date();
            let expiration = new Date(oMonth.expiration);

            if(checkExpiration(expiration) === true){
                calendar = calendar.concat(oMonth.calendar);
                return;
            }
            /*if ((expiration.getFullYear() === now.getFullYear() && expiration.getMonth() < now.getMonth()) ||
                (expiration.getFullYear() < now.getFullYear()) ||
                (expiration.getFullYear() === now.getFullYear() && expiration.getMonth() >= now.getMonth() &&
                    now.getTime() - expiration.getTime() <= c_expirationTime) ||
                (expiration.getFullYear() > now.getFullYear() &&
                    now.getTime() - expiration.getTime() <= c_expirationTime)) {

                calendar = calendar.concat(oMonth.calendar);
                return;
            }*/

        } catch (err) { /* nothing to do */
        }

        db_months.delete('/' + monthYear);
        vUrl = vUrl.concat(createDayUrl(el));
    });

    db_months.save();
    if (vUrl.length === 0) {
        logger.info("Read from db for " + dates[0].date.toISOString());
        calendar = filterNews(calendar);
        callback(null, calendar);
        return;
    }

    try {
        let requests = [];
        let oMonthData = [];

        vUrl.forEach(url => {
            let options = {
                uri: url
            };
            requests.push(rp(options)
                .then(response => {
                    extractListOfEvents(response, oMonthData);
                }));
        });

        // noinspection JSCheckFunctionSignatures
        Promise.all(requests)
            .catch(err => {
                logger.error(err.message);
                callback(err, null);
            })
            .finally(function () {
                let expiration = new Date(new Date().getTime() + c_expirationTime);
                let oMonth = [];

                oMonthData.forEach((el) => {
                    let monthYear = el.date.substr(0, el.date.length - 3);
                    let index = oMonth.findIndex((element) => {
                        return element.monthYear === monthYear;
                    });

                    if (index === -1) {
                        oMonth.push({
                            monthYear: monthYear,
                            expiration: expiration,
                            calendar: [el]
                        });
                    } else {
                        oMonth[index].calendar = oMonth[index].calendar.concat(el);
                    }
                });

                oMonth.forEach((el) => {
                    db_months.push('/' + el.monthYear, el);
                    calendar = calendar.concat(el.calendar);
                });
                db_months.save();
                logger.info("Responses finished for: " + oMonth.map((el) => el.monthYear).join(','));
                calendar = filterNews(calendar);
                callback(null, calendar);
            });
    } catch (err) {
        logger.error(err.message);
        db_months.reload();
        callback(err, null);
    }
}

function extractEventDetailJson(json, eGraphic) {
    eGraphic.push(JSON.parse(json).items);
}

function extractEventDetailText(html, eText) {
    let $ = cheerio.load(html);
    let oText = {};
    $('div .overlay__content').find('div .flexBox').find('table td').each((index, value) => {
        if ($(value).hasClass("label calendarspecs__spec") === true) {
            oText.header = $(value).html().trim();
            return;
        }

        if ($(value).hasClass("full calendarspecs__specdescription") === true) {
            let text = '';
            try {
                text = $(value).html().trim();
                let descr = $(text);
                switch (descr.length) {
                    case 3:
                        break;
                    case 2:
                        text = descr[0].children[0].data;
                }
            } catch (e) {

            }
            oText.description = text;
            eText.push(oText);
            oText = {};
        }
    });
}

function extractListOfEvents(html, calendar) {
    const $ = cheerio.load(html);
    let calendar_json = {};
    let time = "";
    let date = "";
    let calendar_time = "";

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let monthYear = $('.calendar__options').find('strong').text();
    let month, year;

    if (/Yesterday:/i.test(monthYear)) {
        month = (monthNames.indexOf(monthYear.substr(11, 3)) + 1).toString();
        year = (new Date()).getFullYear();
    } else if (/Today:/i.test(monthYear)) {
        month = (monthNames.indexOf(monthYear.substr(7, 3)) + 1).toString();
        year = (new Date()).getFullYear();
    } else if (/Tomorrow:/i.test(monthYear)) {
        month = (monthNames.indexOf(monthYear.substr(10, 3)) + 1).toString();
        year = (new Date()).getFullYear();
    } else {
        month = (monthNames.indexOf(monthYear.substr(monthYear.length - 8, 3)) + 1).toString();
        year = monthYear.substr(monthYear.length - 5, 5);
    }


    if (parseInt(month) === 0) { //day variant
        month = (monthNames.indexOf(monthYear.substr(0, 3)) + 1).toString();
    }

    if (month.length === 1) {
        month = '0' + month;
    }


    $('.calendar__row').filter(function () {
        let data = $(this);

        let spans = data.find('span');
        if (spans.length > 0 && spans[0].attribs['class'] === "date" &&
            spans[0].children.length === 2) {
            date = spans[0].children[0].data + " " + spans[0].children[1].children[0].data;
        } else if (data.find('.calendar__date').text().trim() !== "") {
            date = data.find('.calendar__date').text().trim();
        }

        if (date) {
            let day = date.match(/\d{1,2}/);
            if (day.toString().length === 1) {
                day = '0' + day;
            }
            var calendar_date = year + '-' + month + '-' + day;
        } else {
            calendar_date = date;
        }

        if (data.find('.calendar__time').text() === "") {
            calendar_time = time;
        } else {
            calendar_time = convertTo24Hour(data.find('.calendar__time').text());
            time = convertTo24Hour(data.find('.calendar__time').text());
        }

        let impact = data.find('.calendar__impact-icon--screen').children();
        if (impact.length > 0) {
            impact = impact[0].attribs['class'];

            let currency = data.find('.calendar__currency').text();
            let actual = data.find('.calendar__actual').text();
            let title = trim_space(data.find('.calendar__event').text()).trim();
            let url_details = data.find('.calendar__detail').parent().attr('data-eventid');
            let forecast = data.find('.calendar__forecast').text();
            let previous = data.find('.calendar__previous').text();

            calendar_json = {
                date: calendar_date.trim(),
                time: calendar_time.trim(),
                symbol: currency.trim(),
                title: title,
                details: url_details,
                actual: actual,
                forecast: forecast,
                previous: previous,
                impact: impact
            };
            calendar.push(calendar_json);
        }
    });
}

exports.ff_calendar = ff_calendar;
exports.ff_event = ff_event;