import { Router } from "express";

import { authenticateToken, requireSubscribedAdmin } from "../middleware/auth";
import {
  addStudent,
  updateStudent,
  deleteStudent,
  getStudents,
  getConfiguredShifts,
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

export default router;
