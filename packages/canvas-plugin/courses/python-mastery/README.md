# Python Mastery Course

A comprehensive 4-module Python learning path for students from fundamentals to professional patterns.

## Course Overview

Python Mastery is a sequential course that takes students from basic Python syntax through object-oriented programming to professional design patterns. The course emphasizes hands-on learning through interactive labs, with each module building on the previous one.

- **Total Duration**: 120 minutes (~2 hours)
- **Modules**: 4 sequential labs
- **Target Audience**: Beginner to intermediate programmers
- **Prerequisites**: Basic computer literacy

## Course Structure

### Module 1: Python Fundamentals (30 min)

Learn the basics of Python programming:
- Variables and naming conventions
- Data types (int, float, str, bool, list, dict)
- Operators (arithmetic, comparison, logical)
- Control flow (if/elif/else, while, for loops)
- Basic input/output operations

**Prerequisites**: None (starter module)

### Module 2: Python Functions (25 min)

Master function definition and usage:
- Defining functions with def keyword
- Function parameters and arguments
- Return values and multiple returns
- Scoping and namespaces (global, local, nonlocal)
- Lambda functions and anonymous functions
- Function documentation (docstrings)

**Prerequisites**: Python Fundamentals

### Module 3: Python Object-Oriented Programming (35 min)

Understand object-oriented programming concepts:
- Classes and objects
- Instance variables and methods
- Class variables and class methods
- Inheritance and method overriding
- Polymorphism
- Encapsulation and access modifiers
- Special methods (__init__, __str__, etc.)

**Prerequisites**: Python Functions

### Module 4: Python Design Patterns (30 min)

Learn professional coding patterns and best practices:
- Singleton pattern
- Factory pattern
- Observer pattern
- Strategy pattern
- Decorator pattern
- Context managers
- PEP 8 style guide
- Code organization and modularity

**Prerequisites**: Python OOP

## Total Skills Granted

Upon completion, students master:
- `python-basics` - Fundamental Python syntax and operations
- `python-functions` - Function definition, parameters, and scope
- `python-oop` - Classes, inheritance, and object design
- `python-patterns` - Design patterns and professional practices

## Course Flow

```
START
  ↓
[1] Python Fundamentals (30 min)
  ↓
[2] Python Functions (25 min)
    (requires module 1)
  ↓
[3] Python OOP (35 min)
    (requires module 2)
  ↓
[4] Python Patterns (30 min)
    (requires module 3)
  ↓
COURSE COMPLETE
```

## Sequential Progression

This course enforces a strict sequential order. Students must complete each module before proceeding to the next:

1. **Module 1** is available immediately
2. **Module 2** unlocks after completing Module 1
3. **Module 3** unlocks after completing Module 2
4. **Module 4** unlocks after completing Module 3

No modules can be skipped, and no jumping ahead is allowed. This ensures students build a strong foundation before tackling more advanced concepts.

## Using This Course

### Load in Code

```typescript
import { loadCourse } from "src/curriculum/course-loader";

const course = loadCourse("courses/python-mastery/course.yaml");
console.log(course.metadata.title); // "Python Mastery"
console.log(course.modules.length); // 4
```

### Get Next Available Module

```typescript
import { getNextModuleInCourse } from "src/curriculum/course-loader";

// For a student who just started
const nextModule = getNextModuleInCourse(course, []);
// Returns: python-fundamentals

// For a student who completed module 1
const nextModule = getNextModuleInCourse(course, ["python-fundamentals"]);
// Returns: python-functions
```

### Track Student Progress

```typescript
import {
  markModuleComplete,
  getCourseProgress
} from "src/curriculum/progress-tracker";

// Student completes first module with 90% score
const progress = markModuleComplete(
  "alice",
  "python-fundamentals",
  0.9,
  course
);

// Get overall course progress
const courseProgress = getCourseProgress("alice", course);
console.log(courseProgress.overallProgress); // 25% (1 of 4 modules)
console.log(courseProgress.overallScore);    // 0.9
```

## Scoring and Completion

Each module is scored on a scale of 0.0-1.0 based on student performance in the interactive lab. The overall course score is the average of all module scores.

To pass a module, students typically need to achieve a score of 0.7 or higher, depending on the scoring preset configured in the lab system.

## Integration with Canvas Lab System

This course integrates with the Canvas Virtual Teaching Assistant (vTA) system:

1. The course definition is loaded by the course-loader.ts module
2. Module prerequisites are enforced automatically
3. Progress is tracked in the progress-tracker.ts system
4. Each module corresponds to a lab module that can be run with the Canvas CLI

To run a lab for a module:

```bash
bun run src/cli.ts lab python-fundamentals
```

## Testing This Course

The course definition is validated by:

- **YAML Parsing**: Valid YAML syntax with all required fields
- **Module Structure**: Each module has required id, title, labType, and prerequisites
- **Prerequisites Chain**: All prerequisites exist and form a valid dependency graph
- **Sequential Logic**: getNextModuleInCourse() properly enforces ordering

See the project's test suite for automated validation.

## Estimated Timeline

- **Module 1**: 30 minutes
- **Module 2**: 25 minutes
- **Module 3**: 35 minutes
- **Module 4**: 30 minutes
- **Total**: 120 minutes (~2 hours)

Students who take breaks between modules may take longer overall, but this represents the active learning time for each module.

## Support and Troubleshooting

If you encounter issues:

1. **Module won't load**: Verify the course.yaml syntax is valid YAML
2. **Prerequisite not recognized**: Check module IDs match exactly in prerequisite lists
3. **Progress not saving**: Ensure the progress-tracker has write permissions

For detailed technical documentation, see the main Canvas documentation.
