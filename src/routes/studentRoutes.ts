import { Router } from "express";

import {
  authenticateToken,
  requirePaidStudent,
  requireSubscribedAdmin,
} from "../middleware/auth";
import {
  addStudent,
  updateStudent,
  deleteStudent,
  getStudents,
  getConfiguredShifts,
  getStudentSubscription,
  getStudentById,
  updateStudentProfile,
} from "../controllers/studentController";

const router = Router();

router.post(
  "/add-student",
  authenticateToken,
  requireSubscribedAdmin,
  addStudent
);
router.put(
  "/update-student",
  authenticateToken,
  requireSubscribedAdmin,
  updateStudent
);
router.delete(
  "/delete-student/:id",
  authenticateToken,
  requireSubscribedAdmin,
  deleteStudent
);
router.get(
  "/get-students",
  authenticateToken,
  requireSubscribedAdmin,
  getStudents
);
router.get(
  "/get-shifts",
  authenticateToken,
  requireSubscribedAdmin,
  getConfiguredShifts
);
router.get(
  "/get-subscription",
  authenticateToken,
  requirePaidStudent,
  getStudentSubscription
);

router.get(
  "/get-profile",
  authenticateToken,
  requirePaidStudent,
  getStudentById
);
router.put(
  "/update-student-profile",
  authenticateToken,
  requirePaidStudent,
  updateStudentProfile
);
export default router;
