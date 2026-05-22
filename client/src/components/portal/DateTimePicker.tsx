/**
 * DateTimePicker — Custom date+time selector for voice session booking.
 * No external date library needed — uses native Date API.
 * Styled for the portal dark glass theme.
 */
import { useState } from "react";
import { Box, Button, Chip, IconButton, Typography, useTheme } from "@mui/material";
import { ArrowBack, Check } from "@mui/icons-material";

interface DateTimePickerProps {
  onConfirm: (isoString: string) => void;
  onCancel: () => void;
}

const TIME_SLOTS: string[] = [];
for (let h = 6; h <= 22; h++) {
  TIME_SLOTS.push(`${h}:00`);
  if (h < 22) TIME_SLOTS.push(`${h}:30`);
}

function formatTime(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
}

function getDayLabel(date: Date, today: Date): string {
  const isToday = date.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  if (isToday) return "Today";
  if (isTomorrow) return "Tomorrow";

  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function DateTimePicker({ onConfirm, onCancel }: DateTimePickerProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const today = new Date();
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Generate next 7 days
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const selectedDate = days[selectedDayIdx];

  // Filter time slots: if today, only show future times
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const availableSlots = TIME_SLOTS.filter((slot) => {
    if (selectedDayIdx > 0) return true;
    const [h, m] = slot.split(":").map(Number);
    return h * 60 + m > nowMinutes + 10; // at least 10 min from now
  });

  const handleConfirm = () => {
    if (!selectedTime) return;
    const [h, m] = selectedTime.split(":").map(Number);
    const dateTime = new Date(selectedDate);
    dateTime.setHours(h, m, 0, 0);
    onConfirm(dateTime.toISOString());
  };

  const accent = "#A78BFA";
  const accentBg = isDark ? "rgba(167,139,250,0.12)" : "rgba(167,139,250,0.08)";

  return (
    <Box>
      {/* Back + title */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
        <IconButton size="small" onClick={onCancel} sx={{ color: "text.secondary" }}>
          <ArrowBack sx={{ fontSize: 18 }} />
        </IconButton>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
          Pick a Date & Time
        </Typography>
      </Box>

      {/* Day selector */}
      <Box sx={{ display: "flex", gap: 0.75, mb: 2.5, flexWrap: "wrap" }}>
        {days.map((day, idx) => (
          <Chip
            key={idx}
            label={getDayLabel(day, today)}
            onClick={() => { setSelectedDayIdx(idx); setSelectedTime(null); }}
            sx={{
              fontWeight: 600,
              fontSize: 12,
              borderRadius: 8,
              bgcolor: idx === selectedDayIdx ? accentBg : "transparent",
              color: idx === selectedDayIdx ? accent : "text.secondary",
              border: "1px solid",
              borderColor: idx === selectedDayIdx ? accent : "divider",
              "&:hover": { bgcolor: accentBg },
            }}
          />
        ))}
      </Box>

      {/* Time grid */}
      {availableSlots.length === 0 ? (
        <Typography sx={{ fontSize: 12, color: "text.secondary", textAlign: "center", py: 3 }}>
          No available slots today. Try tomorrow.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0.75,
            mb: 2.5,
            maxHeight: 200,
            overflow: "auto",
            "&::-webkit-scrollbar": { width: 4 },
            "&::-webkit-scrollbar-thumb": {
              borderRadius: 2,
              bgcolor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
            },
          }}
        >
          {availableSlots.map((slot) => (
            <Button
              key={slot}
              size="small"
              variant={selectedTime === slot ? "contained" : "outlined"}
              onClick={() => setSelectedTime(slot)}
              sx={{
                fontSize: 12,
                py: 0.75,
                minWidth: 0,
                borderRadius: 8,
                ...(selectedTime === slot
                  ? {
                      bgcolor: accent,
                      color: "#fff",
                      "&:hover": { bgcolor: accent },
                    }
                  : {
                      borderColor: "divider",
                      color: "text.secondary",
                      "&:hover": { borderColor: accent, color: accent },
                    }),
              }}
            >
              {formatTime(slot)}
            </Button>
          ))}
        </Box>
      )}

      {/* Confirm */}
      <Button
        fullWidth
        variant="contained"
        disabled={!selectedTime}
        startIcon={<Check />}
        onClick={handleConfirm}
        sx={{
          borderRadius: 10,
          py: 1.25,
          fontSize: 13,
          fontWeight: 700,
          bgcolor: accent,
          "&:hover": { bgcolor: "#9373E0" },
          "&.Mui-disabled": {
            bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
            color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
          },
        }}
      >
        {selectedTime
          ? `Confirm · ${getDayLabel(selectedDate, today)} at ${formatTime(selectedTime)}`
          : "Select a time"}
      </Button>
    </Box>
  );
}
