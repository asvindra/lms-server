import { Router } from "express";

import { authenticateToken, requireSubscribedAdmin } from "../middleware/auth";
import {
  allocateSeat,
  deallocateSeat,
  getAvailableSeats,
} from "../controllers/seatController";

const router = Router();

router.get(
  "/get-available-seats",
  authenticateToken,
  requireSubscribedAdmin,
  getAvailableSeats
);
router.post(
  "/allocate-seat",
  authenticateToken,
  requireSubscribedAdmin,
  allocateSeat
);
router.post(
  "/deallocate-seat",
  authenticateToken,
  requireSubscribedAdmin,
  deallocateSeat
);
export default router;
