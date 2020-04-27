# Forexfactory calendar
In this test project the following was implemented:
- NodeJS server with parser to get calendar data from forexfactory.com 
- jQuery calendar with colorful tiles for events + showing graphics with predicted and actual data for events, where it's available
- For prevention of load on server with frequent requests it's used caching technique to store data in a JSON database. The data is updated from server only after not valid expiration data
