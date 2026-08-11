# Lexora Knowledge Core – Kickoff Notes
Date: 2025-09-03
Attendees: Ananya, Rahul, Priya, Sneha, Neha Kapoor (Lexora)

## Context
Lexora is a mid-size legal tech company. Their lawyers spend a lot of time searching across case files, statutes, internal memos and previous opinions. Current tools (mostly search + folders) do not surface important relationships.

## Goals discussed
- Faster discovery of related cases and statutes
- Ability to see how a particular statute has been interpreted across cases
- Capture internal reasoning that currently lives only in senior lawyers’ heads
- Not just another chat-with-PDF tool

## Early technical thoughts (Rahul)
Simple vector RAG will not be enough. Legal documents have strong hierarchical and referential structure. We need a way to represent and query those links.

## Next steps
- Map current document types and how lawyers currently find information
- Small prototype showing linked entities (case ↔ statute ↔ internal note)
- Sneha to collect 15–20 sample documents from Lexora (anonymised)
