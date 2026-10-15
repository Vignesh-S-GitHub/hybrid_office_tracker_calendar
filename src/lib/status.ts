import { Building2, House, CalendarDays, Palmtree } from "lucide-react";
import type { Status } from "../types";

export const statusInfo = {
  WFO: {
    label: "Work from office",
    short: "WFO Days",
    Icon: Building2,
    className: "office",
  },
  WFH: {
    label: "Work from home",
    short: "WFH Days",
    Icon: House,
    className: "home",
  },
  Leave: {
    label: "Personal leave",
    short: "Leave Days",
    Icon: CalendarDays,
    className: "leave",
  },
  Holiday: {
    label: "Public holiday",
    short: "Holidays",
    Icon: Palmtree,
    className: "holiday",
  },
};
export const statuses = Object.keys(statusInfo) as Status[];
