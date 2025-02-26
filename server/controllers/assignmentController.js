import asyncHandler from "express-async-handler";
import Course from "../models/Course.js";
import Student from "../models/Student.js";
import Assignment from "../models/Assignment.js";
import { validateURL } from "../utils/validator.js";

// Lecturer
// ------------------------------------------------------
// @desc Lecturer view task uploaded
// @route GET /api/assignment/uploaded-task
// @access Private (lecturer only)
const viewTask = asyncHandler(async (req, res) => {
  const { _id } = req.staff;

  const task = await Assignment.find({ uploadedBy: _id });

  if (!task) {
    res.status(400);
    throw new Error("Assignments not found");
  }

  let updatedTask = [];
  const pushCourseName = async task => {
    for (let i = 0; i < task.length; i++) {
      const course = await Course.findById(task[i].course);
      const merged = Object.assign(
        {
          courseName: course.courseName,
          subjectName: course.subjects.filter(
            s => s._id.toString() === task[i].subject.toString()
          )[0].subjectName,
        },
        task[i]._doc
      );
      updatedTask.push(merged);
    }
  };

  await pushCourseName(task);

  res.json(updatedTask);
});

// @desc Create an assignment
// @route POST /api/assignment/create-task
// @access Private (lecturer)
const createTask = asyncHandler(async (req, res) => {
  const { _id } = req.staff;
  const { course, subject, topicName, topicURL, due } = req.body;

  // validate URL
  const { valid, errors } = validateURL(topicURL);

  if (!valid) {
    res.status(400);
    throw new Error(errors[Object.keys(errors)[0]]);
  }

  // validate course and subject ids
  const courseDetails = await Course.findById(course);

  if (!courseDetails) {
    res.status(400);
    throw new Error("Course does not exist");
  }

  const subjectValid = courseDetails.subjects.filter(
    s => s._id.toString() === subject.toString()
  );

  if (subjectValid.length === 0) {
    res.status(400);
    throw new Error("Subject does not exist");
  }

  const assignment = new Assignment({
    uploadedBy: _id,
    course: course,
    subject: subject,
    topicName: topicName,
    topicURL: topicURL,
    due: due,
  });

  await assignment.save();
  res.status(201).json(`${topicName} has been created successfully`);
});

// @desc Update an assignment
// @route PATCH /api/assignment/update-task/:assignmentId
// @access Private (lecturer)
const updateTask = asyncHandler(async (req, res) => {
  const { _id } = req.staff;
  const { assignmentId } = req.params;
  const { course, subject, topicName, topicURL, due } = req.body;

  // validate URL
  const validate = validateURL(topicURL);

  if (!validate.valid) {
    res.status(400);
    throw new Error(validate.message);
  }

  // validate course and subject ids
  const courseDetails = await Course.findById(course);

  if (!courseDetails) {
    res.status(400);
    throw new Error("Course does not exist");
  }

  const subjectValid = courseDetails.subjects.filter(
    s => s._id.toString() === subject.toString()
  );

  if (subjectValid.length === 0) {
    res.status(400);
    throw new Error("Subject does not exist");
  }

  const assignment = await Assignment.findById(assignmentId);

  if (assignment) {
    if (assignment.uploadedBy.toString() === _id.toString()) {
      (assignment.uploadedBy = _id),
        (assignment.course = course),
        (assignment.subject = subject),
        (assignment.topicName = topicName),
        (assignment.topicURL = topicURL),
        (assignment.due = due);

      const updatedAssignment = await assignment.save();
      res.json(updatedAssignment);
    }
  } else {
    res.status(404);
    throw new Error("Assignment not found");
  }
});

// @desc Delete an assignment
// @route PATCH /api/assignment/:assignmentId
// @access Private (Lecturer)
const deleteTask = asyncHandler(async (req, res) => {
  const { _id } = req.staff;
  const { assignmentId } = req.params;

  const assignment = await Assignment.findById(assignmentId);

  let removedAssignment = [];
  const updateStudent = async students => {
    for (let i = 0; i < students.length; i++) {
      removedAssignment = await Student.findById(students[i]._id).select(
        "-password"
      );

      removedAssignment.assignments = removedAssignment.assignments.filter(
        asg => asg.assignment.toString() !== assignmentId.toString()
      );

      await removedAssignment.save();
    }
  };

  if (assignment) {
    if (assignment.uploadedBy.toString() === _id.toString()) {
      await assignment.remove();

      // remove from all student
      const students = await Student.find({
        course: assignment.course,
      }).select("-password");

      if (!students) {
        res.status(404);
        throw new Error("No student found");
      }

      await updateStudent(students);

      res.json({ message: "Assignment has been removed" });
    } else {
      res.status(400);
      throw new Error("Unauthorized request, please try again later");
    }
  } else {
    res.status(404);
    throw new Error("Assignment not found");
  }
});

// @desc Assign task to student
// @route PATCH /api/assignment/assign-task/:id
// @access Private (lecturer only)
const assignTask = asyncHandler(async (req, res) => {
  const { assignmentId } = req.params;
  const task = await Assignment.findById(assignmentId);

  if (!task) {
    res.status(400);
    throw new Error("Assignments not found");
  }

  let studentCounter = task.studentAssigned;

  if (new Date(task.due).toISOString() > new Date(Date.now()).toISOString()) {
    const students = await Student.find({}).select("-password");

    if (!students) {
      res.status(404);
      throw new Error("Student not found");
    }
    let updateStudent;
    const pushAssignment = async students => {
      for (let i = 0; i < students.length; i++) {
        if (students[i].course.toString() === task.course.toString()) {
          const studentIndex = students[i]._id;

          if (students[i]?.isActive) {
            updateStudent = await Student.findById(studentIndex).select(
              "-password"
            );

            if (
              !updateStudent.assignments.find(
                asg => asg.assignment.toString() === assignmentId.toString()
              )
            ) {
              updateStudent.assignments.push({
                assignment: task._id,
              });
              studentCounter = studentCounter + 1;
            }

            await updateStudent.save();
          }
        }
      }
    };

    await pushAssignment(students);
  }

  task.studentAssigned = studentCounter;
  await task.save();
  res.json("Task assigned to all students within the course successfully.");
});

// @desc Display students submission
// @route GET /api/assignment/grade-paper?assignmentId=xxx
// @access Private (lecturer only)
const viewPaper = asyncHandler(async (req, res) => {
  const { assignmentId } = req.query;

  const students = await Student.find({
    "assignments.assignment": assignmentId,
    "assignments.submission": true,
  }).select("-password -dob -gender -_id");

  if (!students) {
    res.status(400);
    throw new Error("Student records does not exist");
  }

  // only assignment match asgId (array)
  let singleAssignment = [];
  students.forEach(student => {
    for (let i = 0; i < student.assignments.length; i++) {
      if (student.assignments[i].assignment.toString() === assignmentId) {
        singleAssignment.push(student.assignments[i]);
      }
    }

    student.assignments = singleAssignment;
    singleAssignment = [];
  });

  // parse topicName and topicURL
  const assignment = await Assignment.findById(assignmentId);

  if (!assignment) {
    res.status(400);
    throw new Error("Assignment does not exist");
  }

  if (
    new Date(assignment.due).toISOString() > new Date(Date.now()).toISOString()
  ) {
    res.json({
      topicName: assignment.topicName,
      topicURL: assignment.topicURL,
      due: new Date(assignment.due), //.toString().slice(0, 15)
      students,
    });
  } else {
    res.json({
      topicName: assignment.topicName,
      topicURL: assignment.topicURL,
      due: new Date(assignment.due),
      message:
        "Assignment submission due date has passed, all actions on student grades have been halted!",
    });
  }
});

// @desc Grade students paper
// @route PATCH /api/assignment/grade-paper?studentID=xxx&assignmentId=xxx
// @access Private (Lecturer only)
const gradePaper = asyncHandler(async (req, res) => {
  const { studentID, assignmentId } = req.query;
  const { grade, comments } = req.body;

  if (!studentID || !assignmentId) {
    res.status(400);
    throw new Error("StudentID or task is not provided");
  }

  if (!grade || !comments) {
    res.status(400);
    throw new Error("Invalid Input");
  }

  const student = await Student.findOne({ studentID: studentID }).select(
    "-password -dob -gender"
  );

  if (!student) {
    res.status(400);
    throw new Error("Student does not exist, invalid studentID");
  }

  const gradeTask = student.assignments.filter(
    assignment => assignment._id.toString() === assignmentId.toString()
  );

  // mark the assignment
  gradeTask[0].grade = grade;
  gradeTask[0].comments = comments;

  const updatedStudent = await student.save();
  res.json(updatedStudent);
});

// Student
// -------------------------------------------------------------------
// @desc View all assignment (student)
// @route GET /api/assignment/view-task
// @access Private (student only)
const viewStudentTask = asyncHandler(async (req, res) => {
  const studentAssignment = req.student.assignments;

  let updatedStudentAssignment = [];
  const pushAssignmentDetails = async asg => {
    for (let i = 0; i < asg.length; i++) {
      const assignment = await Assignment.findById(asg[i].assignment);
      const merged = Object.assign(
        {
          course: assignment.course,
          subject: assignment.subject,
          topicName: assignment.topicName,
          topicURL: assignment.topicURL,
          due: assignment.due,
        },
        asg[i]._doc
      );
      updatedStudentAssignment.push(merged);
    }
  };

  await pushAssignmentDetails(studentAssignment);

  let updatedStudentAssignmentDetails = [];
  const pushCourseDetails = async asg => {
    for (let i = 0; i < asg.length; i++) {
      const course = await Course.findById(asg[i].course);

      const merged = Object.assign(
        {
          courseName: course.courseName,
          subjectName: course.subjects.filter(
            s => s._id.toString() === asg[i].subject.toString()
          )[0].subjectName,
        },
        asg[i]
      );

      updatedStudentAssignmentDetails.push(merged);
    }
  };

  await pushCourseDetails(updatedStudentAssignment);

  res.status(200).json(updatedStudentAssignmentDetails);
});

// @desc View single assignment
// @route GET /api/assignment/view-task/:submissionId
// @access Private (student only)
const viewSingleStudentTask = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;

  const student = req.student;

  if (!student) {
    res.status(400);
    throw new Error("Student not found");
  }

  let singleAssignment = [];
  for (let i = 0; i < student.assignments.length; i++) {
    const submissionDetails = student.assignments[i];
    if (submissionDetails._id.toString() === submissionId.toString()) {
      singleAssignment.push(submissionDetails);
    }
  }

  res.json(singleAssignment);
});

// @desc Submit assignment
// @route PATCH /api/assignment/submit-task/:submissionId
// @access Private (student only)
const submitAssignment = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;
  const { submissionFile } = req.body;

  const student = req.student;

  if (!student) {
    res.status(400);
    throw new Error("Student not found");
  }

  if (!submissionId) {
    res.status(400);
    throw new Error("Submission ID does not exist");
  }

  const validate = validateURL(submissionFile);

  if (!submissionFile || !validate.valid) {
    res.status(400);
    throw new Error(validate.message);
  }

  const submit = student.assignments.filter(
    assignment => assignment._id.toString() === submissionId.toString()
  );

  if (submit && submit[0].length !== 0) {
    // submit the file
    if (!submit[0].submission) {
      submit[0].submissionFile = submissionFile;
      submit[0].submission = true;
    } else {
      res.status(400);
      throw new Error(
        "Assignment has been submitted, no changes can be attempted!"
      );
    }
  }

  const updatedStudent = await student.save();
  res.json(updatedStudent);
});

export {
  viewTask,
  assignTask,
  createTask,
  updateTask,
  deleteTask,
  viewPaper,
  gradePaper,
  viewStudentTask,
  viewSingleStudentTask,
  submitAssignment,
};
