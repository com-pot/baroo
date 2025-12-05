# REQ-BAR-02 Summaries
For given bar Baroo offers the manager to list all the members in a separate view accessible from a bars dashboard. From here, bar-manager sees each member with count of their order items and settlement status.

To decide whether the order items are settled or not, we declare a new event type:

```json
{
    "type": "member-settled",
    "target": "bar-2025",
    "data": {
        "member": "john-doe",
        "amountPaid": 4.20
    }
}
```

We find last event of this type for given member and all order items created before this event are considered settled. All the order items that were created after the last settlement are considered pending.

From the member overview, we can display detail as an aside drawer that shows us audit-log style timeline with order items and settlement events:

```
o 2025-02-03 09:11 Settled tab, paid 11.2
|
o 2025-02-02 12:01 Ordered "Beer 13° (1)"
|
o 2025-02-02 11:32 Ordered "Beer 13° (x)"
|
...
```

In the detail we are also able to create the settlement event.
