import { Router } from "express";
import {
  configureShifts,
  getConfiguredShifts,
  updateShifts,
  deleteShifts,
  deleteShiftById,
  getSeatConfig,
  updateSeatConfig,
  deleteSeat,
  configureSeats,
} from "../controllers/configController";
import { authenticateToken, requireSubscribedAdmin } from "../middleware/auth";

const router = Router();

router.post(
  "/configure-shifts",
  authenticateToken,
  requireSubscribedAdmin,
  configureShifts
);
router.get(
  "/shifts-configured",
  authenticateToken,
  requireSubscribedAdmin,
  getConfiguredShifts
);
router.put(
  "/update-shifts",
  authenticateToken,
  requireSubscribedAdmin,
  updateShifts
);
router.delete(
  "/delete-shifts",
  authenticateToken,
  requireSubscribedAdmin,
  deleteShifts
);
router.delete(
  "/delete-shift/:shiftNumber",
  authenticateToken,
  requireSubscribedAdmin,
  deleteShiftById
);

router.post(
  "/configure-seats",
  authenticateToken,
  requireSubscribedAdmin,
  configureSeats
);
router.get(
  "/seat-config",
  authenticateToken,
  requireSubscribedAdmin,
  getSeatConfig
);
router.put(
  "/update-seat",
  authenticateToken,
  requireSubscribedAdmin,
  updateSeatConfig
);
router.delete(
  "/delete-seat/:seatId",
  authenticateToken,
  requireSubscribedAdmin,
  deleteSeat
);

export default router;
