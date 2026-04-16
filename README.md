# SubSeer: The Household Account Manager

SubSeer is a website that allows users to create and join ‘households’, being able to add and access shared account information. There are two levels of users in each household: managers and members. Managers are able to delete the household, add/remove members, promote/demote managers, add/edit/remove accounts, and review account requests. They can also remove members from being able to view account credentials. Members are able to create requests for new accounts to be stored/created, and they can view account information for ones they have access to.
<br><br>
This website will be primarily used by families/roommates who share different accounts and want one localized place to store account information. It will streamline the communication between members of those groups by allowing everyone to see account information in one place, instead of having to ask around for different credentials. If account credentials are changed for a subscription, all the managers have to do is just update the subscription on SubSeer, then the members with valid permissions can see the new updated account credentials, instead of having to pester others to find them out.
<br><br>
*Name is subject to change.*
<br><br>

# Roles

**Product Owner:** Andrew Kaiser <br>
**Scrum Master:** Sam Knight <br>
**Developer:** Blake Beeler <br>
**Developer:** Dena Chen <br>
**Developer:** Rhys Maryn <br> 
<br>

# Documents

[Sprint 1 Review](./documentation/post_sprint/sprint_one_review.pdf) <br>
[Sprint 1 Retrospective](./documentation/post_sprint/sprint_one_retrospective.pdf)


# Diagrams
(diagrams may not be up to date)

## Use Case Diagram
![Use Case Diagram Image](/diagrams/use_case.png)

## Base User State Diagram
![Base User State Diagram](/diagrams/base_user_state_diagram.png)

# Running the Code
```bash
deno task start
```

Or run the tests:
```bash
deno task check
```
