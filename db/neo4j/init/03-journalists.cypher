// Journalist killings seed data.
// Each killing is modelled as an Event node with sub_type="Journalist Killing",
// connected to the Location where it occurred via :OCCURRED_IN. The Journalist
// is stored as a Principal:Journalist node and connected to the event via
// :TARGETED so a killing has a unique person attached. The frontend reads
// /api/graph/journalist-killings which aggregates per-location for the map.

// ---- Locations referenced by killings ----
MERGE (mex:Location {id: "location:mex"})
SET mex.name = "Mexico", mex.location_type = "Country",
    mex.iso_a2 = "MX", mex.iso_a3 = "MEX";

MERGE (rus:Location {id: "location:rus"})
SET rus.name = "Russia", rus.location_type = "Country",
    rus.iso_a2 = "RU", rus.iso_a3 = "RUS";

MERGE (ukr:Location {id: "location:ukr"})
SET ukr.name = "Ukraine", ukr.location_type = "Country",
    ukr.iso_a2 = "UA", ukr.iso_a3 = "UKR";

MERGE (phl:Location {id: "location:phl"})
SET phl.name = "Philippines", phl.location_type = "Country",
    phl.iso_a2 = "PH", phl.iso_a3 = "PHL";

MERGE (pse:Location {id: "location:pse"})
SET pse.name = "Palestine", pse.location_type = "Country",
    pse.iso_a2 = "PS", pse.iso_a3 = "PSE";

// ---- Topic ----
MERGE (press_topic:Topic {id: "topic:press_freedom"})
SET press_topic.name = "Press Freedom",
    press_topic.category = "Human Rights";

// ---- Killings ----
// Mexico (3)
MERGE (j1:Principal:Journalist {id: "journalist:javier_valdez"})
SET j1.name = "Javier Valdez Cárdenas", j1.principal_type = "Journalist", j1.country = "Mexico";
MERGE (e1:Event {id: "event:journalist_killing:mex:javier_valdez:2017"})
SET e1.event_type = "Journalist Killing", e1.sub_type = "Journalist Killing",
    e1.label = "Killing of Javier Valdez Cárdenas",
    e1.journalist_name = "Javier Valdez Cárdenas",
    e1.period_from = date("2017-05-15"), e1.period_to = date("2017-05-15"),
    e1.confidence = 1.0;
MERGE (j1)<-[:TARGETED]-(e1);
MATCH (e1:Event {id: "event:journalist_killing:mex:javier_valdez:2017"}),
      (mex:Location {id: "location:mex"})
MERGE (e1)-[:OCCURRED_IN]->(mex);
MATCH (e1:Event {id: "event:journalist_killing:mex:javier_valdez:2017"}),
      (press_topic:Topic {id: "topic:press_freedom"})
MERGE (e1)-[:ASSOCIATED_WITH]->(press_topic);

MERGE (j2:Principal:Journalist {id: "journalist:miroslava_breach"})
SET j2.name = "Miroslava Breach", j2.principal_type = "Journalist", j2.country = "Mexico";
MERGE (e2:Event {id: "event:journalist_killing:mex:miroslava_breach:2017"})
SET e2.event_type = "Journalist Killing", e2.sub_type = "Journalist Killing",
    e2.label = "Killing of Miroslava Breach",
    e2.journalist_name = "Miroslava Breach",
    e2.period_from = date("2017-03-23"), e2.period_to = date("2017-03-23"),
    e2.confidence = 1.0;
MERGE (j2)<-[:TARGETED]-(e2);
MATCH (e2:Event {id: "event:journalist_killing:mex:miroslava_breach:2017"}),
      (mex:Location {id: "location:mex"})
MERGE (e2)-[:OCCURRED_IN]->(mex);

MERGE (j3:Principal:Journalist {id: "journalist:lourdes_maldonado"})
SET j3.name = "Lourdes Maldonado López", j3.principal_type = "Journalist", j3.country = "Mexico";
MERGE (e3:Event {id: "event:journalist_killing:mex:lourdes_maldonado:2022"})
SET e3.event_type = "Journalist Killing", e3.sub_type = "Journalist Killing",
    e3.label = "Killing of Lourdes Maldonado López",
    e3.journalist_name = "Lourdes Maldonado López",
    e3.period_from = date("2022-01-23"), e3.period_to = date("2022-01-23"),
    e3.confidence = 1.0;
MERGE (j3)<-[:TARGETED]-(e3);
MATCH (e3:Event {id: "event:journalist_killing:mex:lourdes_maldonado:2022"}),
      (mex:Location {id: "location:mex"})
MERGE (e3)-[:OCCURRED_IN]->(mex);

// Russia (2)
MERGE (j4:Principal:Journalist {id: "journalist:anna_politkovskaya"})
SET j4.name = "Anna Politkovskaya", j4.principal_type = "Journalist", j4.country = "Russia";
MERGE (e4:Event {id: "event:journalist_killing:rus:anna_politkovskaya:2006"})
SET e4.event_type = "Journalist Killing", e4.sub_type = "Journalist Killing",
    e4.label = "Killing of Anna Politkovskaya",
    e4.journalist_name = "Anna Politkovskaya",
    e4.period_from = date("2006-10-07"), e4.period_to = date("2006-10-07"),
    e4.confidence = 1.0;
MERGE (j4)<-[:TARGETED]-(e4);
MATCH (e4:Event {id: "event:journalist_killing:rus:anna_politkovskaya:2006"}),
      (rus:Location {id: "location:rus"})
MERGE (e4)-[:OCCURRED_IN]->(rus);

MERGE (j5:Principal:Journalist {id: "journalist:paul_klebnikov"})
SET j5.name = "Paul Klebnikov", j5.principal_type = "Journalist", j5.country = "Russia";
MERGE (e5:Event {id: "event:journalist_killing:rus:paul_klebnikov:2004"})
SET e5.event_type = "Journalist Killing", e5.sub_type = "Journalist Killing",
    e5.label = "Killing of Paul Klebnikov",
    e5.journalist_name = "Paul Klebnikov",
    e5.period_from = date("2004-07-09"), e5.period_to = date("2004-07-09"),
    e5.confidence = 1.0;
MERGE (j5)<-[:TARGETED]-(e5);
MATCH (e5:Event {id: "event:journalist_killing:rus:paul_klebnikov:2004"}),
      (rus:Location {id: "location:rus"})
MERGE (e5)-[:OCCURRED_IN]->(rus);

// Ukraine (2)
MERGE (j6:Principal:Journalist {id: "journalist:brent_renaud"})
SET j6.name = "Brent Renaud", j6.principal_type = "Journalist", j6.country = "USA";
MERGE (e6:Event {id: "event:journalist_killing:ukr:brent_renaud:2022"})
SET e6.event_type = "Journalist Killing", e6.sub_type = "Journalist Killing",
    e6.label = "Killing of Brent Renaud",
    e6.journalist_name = "Brent Renaud",
    e6.period_from = date("2022-03-13"), e6.period_to = date("2022-03-13"),
    e6.confidence = 1.0;
MERGE (j6)<-[:TARGETED]-(e6);
MATCH (e6:Event {id: "event:journalist_killing:ukr:brent_renaud:2022"}),
      (ukr:Location {id: "location:ukr"})
MERGE (e6)-[:OCCURRED_IN]->(ukr);

MERGE (j7:Principal:Journalist {id: "journalist:maks_levin"})
SET j7.name = "Maks Levin", j7.principal_type = "Journalist", j7.country = "Ukraine";
MERGE (e7:Event {id: "event:journalist_killing:ukr:maks_levin:2022"})
SET e7.event_type = "Journalist Killing", e7.sub_type = "Journalist Killing",
    e7.label = "Killing of Maks Levin",
    e7.journalist_name = "Maks Levin",
    e7.period_from = date("2022-03-13"), e7.period_to = date("2022-03-13"),
    e7.confidence = 1.0;
MERGE (j7)<-[:TARGETED]-(e7);
MATCH (e7:Event {id: "event:journalist_killing:ukr:maks_levin:2022"}),
      (ukr:Location {id: "location:ukr"})
MERGE (e7)-[:OCCURRED_IN]->(ukr);

// Philippines (1)
MERGE (j8:Principal:Journalist {id: "journalist:percival_mabasa"})
SET j8.name = "Percival Mabasa", j8.principal_type = "Journalist", j8.country = "Philippines";
MERGE (e8:Event {id: "event:journalist_killing:phl:percival_mabasa:2022"})
SET e8.event_type = "Journalist Killing", e8.sub_type = "Journalist Killing",
    e8.label = "Killing of Percival Mabasa",
    e8.journalist_name = "Percival Mabasa",
    e8.period_from = date("2022-10-03"), e8.period_to = date("2022-10-03"),
    e8.confidence = 1.0;
MERGE (j8)<-[:TARGETED]-(e8);
MATCH (e8:Event {id: "event:journalist_killing:phl:percival_mabasa:2022"}),
      (phl:Location {id: "location:phl"})
MERGE (e8)-[:OCCURRED_IN]->(phl);

// Palestine (4 — Gaza coverage)
MERGE (j9:Principal:Journalist {id: "journalist:shireen_abu_akleh"})
SET j9.name = "Shireen Abu Akleh", j9.principal_type = "Journalist", j9.country = "Palestine";
MERGE (e9:Event {id: "event:journalist_killing:pse:shireen_abu_akleh:2022"})
SET e9.event_type = "Journalist Killing", e9.sub_type = "Journalist Killing",
    e9.label = "Killing of Shireen Abu Akleh",
    e9.journalist_name = "Shireen Abu Akleh",
    e9.period_from = date("2022-05-11"), e9.period_to = date("2022-05-11"),
    e9.confidence = 1.0;
MERGE (j9)<-[:TARGETED]-(e9);
MATCH (e9:Event {id: "event:journalist_killing:pse:shireen_abu_akleh:2022"}),
      (pse:Location {id: "location:pse"})
MERGE (e9)-[:OCCURRED_IN]->(pse);

MERGE (j10:Principal:Journalist {id: "journalist:hamza_dahdouh"})
SET j10.name = "Hamza Al Dahdouh", j10.principal_type = "Journalist", j10.country = "Palestine";
MERGE (e10:Event {id: "event:journalist_killing:pse:hamza_dahdouh:2024"})
SET e10.event_type = "Journalist Killing", e10.sub_type = "Journalist Killing",
    e10.label = "Killing of Hamza Al Dahdouh",
    e10.journalist_name = "Hamza Al Dahdouh",
    e10.period_from = date("2024-01-07"), e10.period_to = date("2024-01-07"),
    e10.confidence = 1.0;
MERGE (j10)<-[:TARGETED]-(e10);
MATCH (e10:Event {id: "event:journalist_killing:pse:hamza_dahdouh:2024"}),
      (pse:Location {id: "location:pse"})
MERGE (e10)-[:OCCURRED_IN]->(pse);

MERGE (j11:Principal:Journalist {id: "journalist:mohammed_abu_hatab"})
SET j11.name = "Mohammed Abu Hatab", j11.principal_type = "Journalist", j11.country = "Palestine";
MERGE (e11:Event {id: "event:journalist_killing:pse:mohammed_abu_hatab:2023"})
SET e11.event_type = "Journalist Killing", e11.sub_type = "Journalist Killing",
    e11.label = "Killing of Mohammed Abu Hatab",
    e11.journalist_name = "Mohammed Abu Hatab",
    e11.period_from = date("2023-11-02"), e11.period_to = date("2023-11-02"),
    e11.confidence = 1.0;
MERGE (j11)<-[:TARGETED]-(e11);
MATCH (e11:Event {id: "event:journalist_killing:pse:mohammed_abu_hatab:2023"}),
      (pse:Location {id: "location:pse"})
MERGE (e11)-[:OCCURRED_IN]->(pse);

MERGE (lbn:Location {id: "location:lbn"})
SET lbn.name = "Lebanon", lbn.location_type = "Country",
    lbn.iso_a2 = "LB", lbn.iso_a3 = "LBN";

MERGE (j12:Principal:Journalist {id: "journalist:issam_abdallah"})
SET j12.name = "Issam Abdallah", j12.principal_type = "Journalist", j12.country = "Lebanon";
MERGE (e12:Event {id: "event:journalist_killing:lbn:issam_abdallah:2023"})
SET e12.event_type = "Journalist Killing", e12.sub_type = "Journalist Killing",
    e12.label = "Killing of Issam Abdallah",
    e12.journalist_name = "Issam Abdallah",
    e12.period_from = date("2023-10-13"), e12.period_to = date("2023-10-13"),
    e12.confidence = 1.0;
MERGE (j12)<-[:TARGETED]-(e12);
MATCH (e12:Event {id: "event:journalist_killing:lbn:issam_abdallah:2023"}),
      (lbn:Location {id: "location:lbn"})
MERGE (e12)-[:OCCURRED_IN]->(lbn);
