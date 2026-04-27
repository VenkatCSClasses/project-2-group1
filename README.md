# SubSeer: The Household Account Manager

SubSeer is a website that allows users to create and join ‘households’, being able to add and access shared account information. Users are able to log-in/sign-in to the website to access households. There are two levels of users in each household: managers and members. Managers are able to delete the household, remove members, add/edit/remove accounts, and have access to the join code that will allow other users to join the household. Once they have joined the household, members are able to add new accounts and they can view account information for ones they have access to.
<br><br>
This website will be primarily used by families/roommates who share different accounts and want one localized place to store account information. It will streamline the communication between members of those groups by allowing everyone to see account information in one place, instead of having to ask around for different credentials. If account credentials are changed for a subscription, all the managers have to do is just update the subscription on SubSeer, then the members with valid permissions can see the new updated account credentials, instead of having to pester others to find them out.
<br><br>
We implemented this using TypeScript and HTML. For runtime, we used Deno since it supports TypeScript better than Node.js, has built in security measures, and more tools to aid our process. License is CC0 1.0 Universal License, due to the use of LLMs to write tests and assist in coding.
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
[Sprint 1 Retrospective](./documentation/post_sprint/sprint_one_retrospective.pdf)<br>
[Sprint 2 Review](./documentation/post_sprint/sprint_two_review.pdf)


# Diagrams

## Use Case Diagram
[Use Case Diagram Image](/diagrams/use_case.png)

## State Diagrams
[General User State Diagram](/diagrams/user_state_diagram.png)

[Base User State Diagram](/diagrams/base_user_state_diagram.png)

[Household Member State Diagram](/diagrams/household_member_state_diagram.png)

[Household Manager State Diagram](/diagrams/household_manager_state_diagram.png)

## Sequence Diagrams
[User logs in and looks at account information](/diagrams/user_login_access_accounts.png)

[User registers and then joins a household](/diagrams/user_register_and_join_household.png)

[Manager creates a household and adds an account](/diagrams/manager_create_household.png)

# Running the Code
```bash
deno task start
```

Or run the tests:
```bash
deno task check
```
