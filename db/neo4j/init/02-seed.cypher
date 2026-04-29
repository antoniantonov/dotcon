// Lockheed Martin lobbying example
// Lockheed Martin (USA) performed a lobbying event that occurred in the UK
// This demonstrates a cross-country graph connection from USA to UK on the map

MERGE (lockheed:Principal:Organization:Company {id: "principal:lockheed_martin"})
SET lockheed.name = "Lockheed Martin",
    lockheed.principal_type = "Company",
    lockheed.industry = "Defense",
    lockheed.country = "USA",
    lockheed.valid_from = date("1989-10-01"),
    lockheed.valid_to = null,
    lockheed.aliases = ["Lockheed", "Lockheed Martin Corp"];

MERGE (usa:Location {id: "location:usa"})
SET usa.name = "USA",
    usa.location_type = "Country",
    usa.iso_a2 = "US",
    usa.iso_a3 = "USA";

MERGE (gbr:Location {id: "location:gbr"})
SET gbr.name = "United Kingdom",
    gbr.location_type = "Country",
    gbr.iso_a2 = "GB",
    gbr.iso_a3 = "GBR";

MERGE (lobbying_topic:Topic {id: "topic:lobbying"})
SET lobbying_topic.name = "Lobbying",
    lobbying_topic.category = "Political Influence";

MERGE (defense_topic:Topic {id: "topic:defense"})
SET defense_topic.name = "Defense",
    defense_topic.category = "Industry";

MERGE (event:Event {id: "event:money_spend:lockheed:lobbying_uk:2025q4"})
SET event.event_type = "Money Spend",
    event.sub_type = "Lobbying",
    event.label = "Lockheed Martin UK Lobbying Q4 2025",
    event.value = 100000,
    event.currency = "USD",
    event.period_from = date("2025-10-01"),
    event.period_to = date("2025-12-31"),
    event.confidence = 0.95;

MERGE (source:Source {id: "source:us_lobbying_disclosure:2025q4"})
SET source.name = "US Lobbying Disclosure Q4 2025",
    source.source_type = "Government Filing",
    source.url = "https://lda.senate.gov",
    source.retrieved_at = date("2026-04-28");

MERGE (fact:Fact {id: "fact:lockheed_spent_100k_lobbying_uk_2025q4"})
SET fact.statement = "Lockheed Martin spent 100000 USD lobbying in the UK from 2025-10 to 2025-12",
    fact.confidence = 0.95,
    fact.created_at = datetime("2026-04-28T00:00:00Z");

MATCH (lockheed:Principal {id: "principal:lockheed_martin"})
MATCH (usa:Location {id: "location:usa"})
MERGE (lockheed)-[located:LOCATED_IN]->(usa)
SET located.period_from = date("1989-10-01"),
    located.period_to = null,
    located.confidence = 1.0;

MATCH (lockheed:Principal {id: "principal:lockheed_martin"})
MATCH (event:Event {id: "event:money_spend:lockheed:lobbying_uk:2025q4"})
MERGE (lockheed)-[performed:PERFORMED]->(event)
SET performed.role = "spender",
    performed.confidence = 0.95;

MATCH (event:Event {id: "event:money_spend:lockheed:lobbying_uk:2025q4"})
MATCH (gbr:Location {id: "location:gbr"})
MERGE (event)-[:OCCURRED_IN]->(gbr);

MATCH (event:Event {id: "event:money_spend:lockheed:lobbying_uk:2025q4"})
MATCH (lobbying_topic:Topic {id: "topic:lobbying"})
MERGE (event)-[:ASSOCIATED_WITH]->(lobbying_topic);

MATCH (event:Event {id: "event:money_spend:lockheed:lobbying_uk:2025q4"})
MATCH (defense_topic:Topic {id: "topic:defense"})
MERGE (event)-[:ASSOCIATED_WITH]->(defense_topic);

MATCH (lockheed:Principal {id: "principal:lockheed_martin"})
MATCH (defense_topic:Topic {id: "topic:defense"})
MERGE (lockheed)-[:ASSOCIATED_WITH]->(defense_topic);

MATCH (event:Event {id: "event:money_spend:lockheed:lobbying_uk:2025q4"})
MATCH (gbr:Location {id: "location:gbr"})
MERGE (event)-[:TARGETED]->(gbr);

MATCH (event:Event {id: "event:money_spend:lockheed:lobbying_uk:2025q4"})
MATCH (source:Source {id: "source:us_lobbying_disclosure:2025q4"})
MERGE (event)-[:SUPPORTED_BY_SOURCE]->(source);

MATCH (source:Source {id: "source:us_lobbying_disclosure:2025q4"})
MATCH (fact:Fact {id: "fact:lockheed_spent_100k_lobbying_uk_2025q4"})
MERGE (source)-[:ASSERTS]->(fact);

MATCH (fact:Fact {id: "fact:lockheed_spent_100k_lobbying_uk_2025q4"})
MATCH (lockheed:Principal {id: "principal:lockheed_martin"})
MERGE (fact)-[:ABOUT]->(lockheed);

MATCH (fact:Fact {id: "fact:lockheed_spent_100k_lobbying_uk_2025q4"})
MATCH (event:Event {id: "event:money_spend:lockheed:lobbying_uk:2025q4"})
MERGE (fact)-[:ABOUT]->(event);
