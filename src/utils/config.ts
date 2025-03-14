export const generateShifts = (
  numShifts: number,
  hoursPerShift: number,
  startTime: string
) => {
  if (numShifts > 4) throw new Error("Shifts cannot exceed 4");
  if (numShifts === 4 && hoursPerShift > 6) {
    throw new Error(
      "Hours per shift cannot exceed 6 when configuring 4 shifts"
    );
  }
  if (hoursPerShift * numShifts > 24)
    throw new Error("Total shift hours cannot exceed 24");

  const shifts = [];
  let [hours, minutes] = startTime.split(":").map(Number);
  for (let i = 0; i < numShifts; i++) {
    const startHour = hours % 24;
    const startMinute = minutes;
    hours += hoursPerShift;
    const endHour = hours % 24;
    const endMinute = minutes;

    shifts.push({
      shift_number: i + 1,
      start_time: `${startHour.toString().padStart(2, "0")}:${startMinute
        .toString()
        .padStart(2, "0")}`,
      end_time: `${endHour.toString().padStart(2, "0")}:${endMinute
        .toString()
        .padStart(2, "0")}`,
    });
  }
  return shifts;
};
