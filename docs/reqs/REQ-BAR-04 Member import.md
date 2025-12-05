# REQ-BAR-04 Member import
Baroo member summary view offers possibility to import member mapping from a csv like format.
Each row represents mapping record and contains tab separated:
- seq (member sequence)
- nickName (member nickname)
- serialId (the card unique id)

We need an upsert functionality with unique (bar, sequence) key that would go over each mapping and insert it to the table.

The import ui consists of a button "Mapping import" which opens a drawer. This drawer contains a textarea for the mapping data.
