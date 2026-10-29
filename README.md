# Constraint-based Workforce Scheduling System (Shift Calculator)

> **Status: Alpha**  
> Shift Calculator is currently in active development. Core scheduling, validation, manual editing, and optimization features are functional, but some features, configuration options, and scheduling rules are still limited or tailored to the current use case.

**Shift Calculator** is a web-based employee shift scheduling system designed to reduce the amount of manual work required to create monthly staff schedules.

Instead of simply distributing shifts randomly, the scheduler considers employee roles, titles/ranks, availability, existing assignments, staffing requirements, compatibility rules, workload restrictions, and scheduling fairness before assigning employees.

The project was originally developed around a real healthcare-service scheduling workflow, where creating a monthly roster manually can take several hours and involves many interacting staffing rules.


---

<img width="1861" height="787" alt="main_scheduler_matrix" src="https://github.com/user-attachments/assets/d4ff637c-4c47-429c-bcf3-2d7d18656238" />


---

## Why this project?

Employee scheduling becomes difficult when a workplace has more requirements than simply:

> "Put enough people into each shift."

In real workplaces, especially healthcare services, staff members may have different ranks, responsibilities, working patterns, and restrictions.

For example, the original healthcare use case includes situations where:

- Some staff titles/ranks cannot be paired together in the same shift.
- Junior staff may only work certain roles.
- Some employees must be assigned when they are available.
- Vacation, OFF days, special duties, and manually locked assignments must be preserved.
- Employees should not be assigned to schedules that create excessive fatigue.
- Morning, Noon, and Night shifts should be distributed reasonably fairly.

The purpose of Shift Calculator is therefore not only to **fill shifts**, but to generate a schedule that is both **valid and reasonably practical for the people working it**.

---

## Scheduling Rules

The scheduler separates constraints into two general categories.

### Hard Rules

Hard rules may never be violated. If no employee can legally fill a required shift, the scheduler prefers leaving the position as **Open** instead of producing an invalid assignment.

Examples include:

- Employees may only work roles permitted by their title/rank.
- Employees must be available for the assigned date and shift category.
- Incompatible staff titles cannot be paired in the same shift block.
- Locked/manual assignments must remain unchanged.
- Vacation and OFF assignments are respected.
- An employee cannot occupy multiple roles inside the same shift block.
- Invalid same-day shift combinations are rejected.
- **Night → Morning on the following day is not allowed.**
- **Two consecutive double-shift days are not allowed.**
- **Four or more consecutive Night-shift days are not allowed.**
  - Maximum allowed consecutive Night days: **3**
- Continuous-work/fatigue limits require employees to receive rest after excessive work streaks.

The rule engine is centralized so that generation, schedule repair, optimization, and manual schedule validation use the same legality checks.

---

### Soft Rules and Optimization

Some schedules may be technically valid but still undesirable.

These cases are handled as **soft optimization goals** rather than absolute restrictions.

Examples include:

- Keeping Morning / Noon / Night assignments reasonably balanced.
- Reducing excessive workload differences between employees.
- Reducing clusters of double-shift days.
- Increasing spacing between double-shift days.
- Discouraging tiring patterns such as:

```text
Day 1: Noon
Day 2: Morning + Noon
```

These patterns are allowed when necessary, but the optimizer attempts to reduce their occurrence when a safe alternative exists.

The final category-balancing stage is intentionally given high priority so that improving one comfort metric does not significantly damage overall Morning / Noon / Night fairness.

---

> 📷 **IMAGE PLACEHOLDER — Scheduling Rules**  
> Suggested image: Employee/title compatibility settings, availability configuration, or an example validation warning.

---

# Example Use Case

Consider a healthcare service that requires several employees for each Morning, Noon, and Night shift.

The workplace may have staff ranks or titles such as:

```text
Senior Staff
Intermediate Staff
Junior Staff
```

and working roles such as:

```text
In Charge
Member
```

However, scheduling in this environment is not simply a matter of checking whether an employee is available or qualified for a role.

One of the main challenges is **staff compatibility**.

Certain staff titles may not be allowed to work together in the same shift, even when both employees are individually qualified for their assigned roles. For example, a particular junior title may require supervision from specific senior titles and therefore cannot be paired with another incompatible title.

To represent this, Shift Calculator uses a **compatibility matrix** between employee titles/ranks.

A simplified example might look like:

```text
                Senior A    Senior B    Junior
Senior A           ✓           ✓          ✓
Senior B           ✓           ✓          ✗
Junior             ✓           ✗          ✓
```

This means that assigning employees cannot be evaluated individually.

For example:

```text
Employee A
- Available: Yes
- Role allowed: Yes
- Shift allowed: Yes

Employee B
- Available: Yes
- Role allowed: Yes
- Shift allowed: Yes
```

Both employees may appear valid independently, but:

```text
Employee A + Employee B
= Invalid Pair
```

if their titles are incompatible.

This was one of the main motivations for developing Shift Calculator. Many basic scheduling approaches focus on availability, required headcount, and individual role eligibility, but real staffing environments may also require validation of **who is allowed to work with whom**.

The scheduler therefore checks both:

```text
Individual Eligibility
        +
Pair / Team Compatibility
```

before completing a shift block.

Scheduling must also consider employee fatigue and workload. A simple scheduler could otherwise produce patterns such as:

```text
Night
Night
Night
Night
```

or:

```text
Noon
Morning + Noon
```

or:

```text
Double Shift
Double Shift
```

Even if the required headcount is technically filled, these schedules may be invalid, unnecessarily exhausting, or inappropriate for the workplace.

Shift Calculator evaluates candidate employees against these constraints before assignment and then performs additional optimization passes to improve workload distribution, shift balance, and overall schedule quality.

> 📷 **IMAGE PLACEHOLDER — Compatibility Matrix**  
> Suggested image: Title/rank compatibility configuration showing which staff groups may or may not work together.

> 📷 **IMAGE PLACEHOLDER — Valid vs Invalid Pairing Example**  
> Suggested image: A generated shift showing compatible staff, or a validation warning caused by an incompatible pairing.

---

# How the Scheduler Works

The current scheduler uses a **constraint-based heuristic generation and optimization approach**.

It is not simply random assignment.

At a high level, the process looks like this:

```text
Load Employees, Titles, Rules and Existing Shifts
                    ↓
Build Required Shift Slots
                    ↓
Load Fixed / Manual / Locked Assignments
                    ↓
Resolve Roles for Existing Fixed Shifts
                    ↓
Assign Mandatory Employees
                    ↓
Search for Legal Candidates
                    ↓
Score and Assign Candidates
                    ↓
Repair Remaining Open Slots
                    ↓
Optimize Workload and Shift Distribution
                    ↓
Reduce Uncomfortable Shift Patterns
                    ↓
Final Morning / Noon / Night Rebalancing
                    ↓
Validate the Result
                    ↓
User Reviews and Saves the Schedule
```

---

> 📷 **DIAGRAM PLACEHOLDER — Scheduler Flow**  
> A more detailed scheduler architecture / flowchart will be added here later.

---

## 1. Build Required Shifts

Shift templates describe the staffing requirements for each day.

A rule contains information such as:

```text
Location
Role
Shift Category
Day of Week
Required Employee Count
```

For example:

```text
Emergency Department
Monday
Morning
In Charge
Required: 2
```

The scheduler converts these rules into individual staffing requirements that need to be filled.

---

## 2. Load Existing and Fixed Assignments

Before automatically assigning anyone, the scheduler loads assignments that already exist.

Examples include:

- Manual shifts
- Locked shifts
- Vacation
- OFF
- Special duties

These assignments become part of the scheduling context and constrain what the generator may do later.

Generated optimization is not allowed to freely overwrite fixed assignments.

---

## 3. Resolve Fixed Employee Roles

Some manually created shifts may already specify:

```text
Employee
Date
Location
Shift Category
```

but not yet specify whether that employee occupies a particular role such as:

```text
In Charge
Member
```

The scheduler attempts to resolve a legal role while respecting the required staffing structure.

---

## 4. Assign Mandatory Employees

Some staff configurations may specify that an employee should work whenever they are available.

These employees are considered before the ordinary candidate-filling stage.

Mandatory status still does **not** override hard scheduling rules.

---

## 5. Find Legal Candidates

For every remaining position, the scheduler first checks which employees are legally allowed to fill it.

Candidate validation considers factors such as:

```text
Role permission
Title/rank permission
Availability
Shift category permission
Existing shifts
Same-day combinations
Previous/next-day sequences
Fatigue
Night streaks
Double shifts
Staff compatibility
Remaining pair feasibility
```

An employee who violates a hard rule is removed from consideration before scoring begins.

---

## 6. Score Candidates

Legal candidates are ranked using scheduling preferences.

The current scoring system considers factors such as:

- Current workload
- Morning / Noon / Night distribution
- Existing double shifts
- Scheduling fairness

A seeded random component may be used when multiple candidates are similarly suitable, allowing the generator to explore different valid schedules.

---

## 7. Repair Open Slots

Sometimes the initial generation cannot immediately fill every required position.

Instead of giving up immediately, the repair system attempts to rearrange already-generated assignments.

A simplified example:

```text
OPEN shift ← Employee A

Employee A's old shift ← Employee B

Employee B's old shift ← Employee C
```

The repair process can search through multiple levels of candidate displacement while ensuring that every resulting assignment remains legal.

If no legal arrangement can be found, the slot remains **Open**.

This is intentional: an Open position is preferable to silently creating an invalid schedule.

---

## 8. Optimize the Generated Schedule

After coverage generation, additional optimization passes improve the schedule.

Current optimization goals include:

```text
Morning / Noon / Night balance
        ↓
Workload balance
        ↓
Double-shift clustering
        ↓
Double-shift spacing
        ↓
Uncomfortable sequence reduction
        ↓
Final category rebalance
```

Optimization only changes generated assignments when the replacement remains legal.

---

## 9. Validate Before Saving

Manual changes are also validated against scheduling rules.

The schedule editor keeps changes in a temporary working buffer and checks the modified schedule for violations.

Invalid assignments can therefore be corrected before the final schedule is saved.

---

# Application Functions

## Schedule Page

The Schedule page is the main workspace for creating and reviewing monthly rosters.

> 📷 **IMAGE PLACEHOLDER — Schedule Page**  
> Suggested image: Full monthly schedule with several generated shifts.

### Month / Year Selection

Users can switch between schedule months and years to review or manage different scheduling periods.


---

### Spreadsheet Matrix

Provides a more traditional roster-style view where employees and dates can be compared more easily.

This view is useful for inspecting an individual employee's monthly workload and shift pattern.

---

<img width="1861" height="787" alt="main_scheduler_matrix" src="https://github.com/user-attachments/assets/f6d5ab31-83ca-4712-b6c1-1753b9328fd8" />


---

### Auto-generate

**Auto-generate** runs the scheduling engine for the selected period.

The scheduler:

1. Reads staffing requirements.
2. Preserves existing fixed assignments.
3. Searches for legal employees.
4. Repairs coverage gaps when possible.
5. Optimizes the generated schedule.
6. Returns the resulting roster for review.

Generation does not immediately mean that every requested slot is guaranteed to be filled. Impossible assignments may remain marked as **Open**.

---

### Manual Editing

Users can manually add, modify, reassign, or remove shifts after generation.

Manual changes are placed into the current workspace buffer before being permanently saved.

---

### Save Changes

Commits the currently reviewed buffered schedule.

Schedule validation is performed so that known hard-rule violations can be identified before committing the final roster.

---

### Reset Buffer

Discards unsaved workspace changes and returns to the previously stored schedule.

---

### Clear Dates

Removes schedule assignments from the selected scheduling range.

This is useful when rebuilding a month from scratch.

---

### Download Excel (.xlsx)

Exports the current schedule into an Excel workbook for external use, printing, sharing, or further editing.

---

# Employee Management

Employee configuration defines who the scheduler is allowed to assign.

Users can manage information such as:

- Employee name
- Title / rank
- Role permissions inherited from the title
- Employee-specific role exceptions
- Availability
- Mandatory working availability

The scheduler uses this information when evaluating candidates.

---

<img width="1063" height="779" alt="staff_page" src="https://github.com/user-attachments/assets/380c20e2-fcf6-44b0-a2ed-132015ff99a8" />


---

# Titles / Ranks

Titles represent employee groups or ranks that share common scheduling behavior.

A title can define or influence:

- Allowed roles
- Allowed shift categories
- Working-time patterns
- Availability behavior
- Compatibility with other titles

This allows scheduling rules to be configured at the group level instead of individually for every employee.

For example:

```text
Junior
    ↓
Member role only

Senior
    ↓
In Charge or Member
```

Compatibility rules can also prevent invalid employee pairings.

---

<img width="1114" height="767" alt="Emolyee_Titles" src="https://github.com/user-attachments/assets/4941ebf9-30e3-44ef-84a3-35438fec55ce" />


---

# Roles

Roles represent the responsibility an employee performs during a particular shift.

For the current healthcare scheduling use case, common examples are:

```text
In Charge
Member
```

Staffing rules specify how many employees of each role are required for a shift.

---

# Shift Categories

Shift categories describe types of work such as:

```text
Morning
Noon
Night
Special
Vacation
OFF
```

Regular Morning / Noon / Night categories participate directly in automatic scheduling and balancing.

Special, Vacation, and OFF categories can also influence availability and scheduling constraints.

---

# Locations

Locations allow staffing requirements to be separated by workplace or department.

A shift requirement can therefore represent:

```text
Date
+ Location
+ Shift Category
+ Role
+ Required Count
```

---

# Shift Rules

The Shift Rules page defines the recurring staffing requirements used by the automatic scheduler.

Users select:

- Location
- Role
- Shift category
- One or more weekdays
- Required employee count

For example:

```text
Monday – Friday
Location: Ward A
Category: Morning
Role: Member
Required: 2
```

The scheduler then creates these requirements for matching dates during generation.

---

<img width="1254" height="826" alt="Shift_Rules" src="https://github.com/user-attachments/assets/18559d14-127b-49ff-a8f3-4cd3af3d384e" />


---

# Typical Workflow

A basic workflow is:

```text
1. Create Roles
        ↓
2. Create Shift Categories
        ↓
3. Create Titles / Ranks
        ↓
4. Configure Permissions and Compatibility
        ↓
5. Add Employees
        ↓
6. Configure Employee Availability
        ↓
7. Create Locations
        ↓
8. Create Shift Rules
        ↓
9. Add Vacation / OFF / Special / Locked Shifts
        ↓
10. Auto-generate
        ↓
11. Review Warnings and Open Positions
        ↓
12. Manually Adjust if Necessary
        ↓
13. Save Changes
        ↓
14. Export to Excel
```

---

# Design Priorities

The scheduler currently follows roughly this priority order:

```text
1. Hard scheduling rules
2. Required shift coverage
3. Morning / Noon / Night fairness
4. Workload fairness
5. Double-shift distribution
6. Employee comfort preferences
```

A lower-priority optimization should never intentionally violate a higher-priority hard constraint.

---

# Tech Stack

The project is primarily built with:

- **Next.js / React**
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui**
- **Database-backed server actions**
- **XLSX / Excel export**
- Custom modular scheduling and optimization logic

The scheduling engine is implemented as separate modules for concerns such as:

```text
rules/
generation/
scoring/
validation/
optimization/
```

This keeps legality checking separate from fairness scoring and post-generation optimization.

---

# Beta Limitations

Shift Calculator is currently a **Beta project**.

The current version is usable for testing and the original scheduling workflow, but several limitations remain.

- Some scheduling behavior is still tailored to the current healthcare use case.
- Some configuration options are not yet fully generalized.
- Automatic generation uses heuristic search rather than mathematical proof of an optimal schedule.
- Different valid generations may produce slightly different schedules.
- A required position may remain Open if no legal assignment can be found.
- Extremely constrained staffing configurations may require manual adjustment.
- User interface and configuration structure may change during continued development.
- The generated roster should still be reviewed by the responsible scheduler/manager before use.

The application is intended as a **scheduling assistance tool**, not as a replacement for organizational staffing policies, labor regulations, or professional workforce judgment.

---

# Planned Improvements

Potential future improvements include:

- Further reduction of Open positions during highly constrained schedules
- More generalized scheduling rules
- Improved explanation of why a slot cannot be filled
- Additional fairness metrics
- More configurable optimization priorities
- Improved schedule analytics
- Better visualization of rule violations
- Expanded testing and validation
- Improved mobile usability
- Additional export/reporting options

---

# Development

Clone the repository:

```bash
git clone https://github.com/Stellar-Cretaceus/Shift-Calculator.git
cd Shift-Calculator
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Additional environment/database configuration may be required depending on the deployment setup.

---

# Project Background

Shift Calculator began as a practical attempt to reduce the amount of repetitive work involved in manually preparing employee schedules.

The original workflow could require several hours of manual arrangement and checking. The project explores how rule-based generation, constraint validation, limited backtracking, and heuristic optimization can automate much of that process while still allowing a human scheduler to review and adjust the final result.

The goal is not to remove human control from scheduling.

The goal is to make the computer handle the repetitive search and validation work so that the person responsible for the roster can focus on the decisions that actually require human judgment.

---

## Screenshots

<img width="1861" height="787" alt="main_scheduler_matrix" src="https://github.com/user-attachments/assets/3901f95e-e1a3-4c2b-91b5-3e414c3c183a" />


<img width="1114" height="767" alt="Emolyee_Titles" src="https://github.com/user-attachments/assets/c326a8b9-8364-400e-a934-19fd16bf0ab2" />


<img width="1254" height="826" alt="Shift_Rules" src="https://github.com/user-attachments/assets/fef292a1-67f3-468d-8fbd-4c92d3a5a0cf" />


<img width="1063" height="779" alt="staff_page" src="https://github.com/user-attachments/assets/daa530f5-f537-4221-b7d5-29c889bbf96d" />


> 📷 **IMAGE PLACEHOLDER — Validation Warning**

> 📷 **IMAGE PLACEHOLDER — Generated Schedule / Analytics**

---
