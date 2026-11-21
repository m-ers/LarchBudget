import {
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Bus,
  Camera,
  Car,
  Coffee,
  CreditCard,
  Droplets,
  Dumbbell,
  EighthNotes,
  Flame,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Scissors,
  Shield,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sofa,
  Ticket,
  TrainFront,
  TreePalm,
  Tv,
  Umbrella,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/i18n/translate";
import type { CategoryIcon } from "@/lib/category-icons";
import { EnvelopeToken } from "./icons";

/**
 * How each icon in `src/lib/category-icons.ts` is drawn, and the key of its
 * name. Only the icons imported here are bundled.
 */
export const iconDrawings: Record<CategoryIcon, { Icon: LucideIcon; name: MessageKey }> = {
  house: { Icon: House, name: "budget.icons.names.house" },
  sofa: { Icon: Sofa, name: "budget.icons.names.sofa" },
  wrench: { Icon: Wrench, name: "budget.icons.names.wrench" },
  zap: { Icon: Zap, name: "budget.icons.names.zap" },
  flame: { Icon: Flame, name: "budget.icons.names.flame" },
  droplets: { Icon: Droplets, name: "budget.icons.names.droplets" },
  wifi: { Icon: Wifi, name: "budget.icons.names.wifi" },
  smartphone: { Icon: Smartphone, name: "budget.icons.names.smartphone" },
  tv: { Icon: Tv, name: "budget.icons.names.tv" },
  car: { Icon: Car, name: "budget.icons.names.car" },
  fuel: { Icon: Fuel, name: "budget.icons.names.fuel" },
  bus: { Icon: Bus, name: "budget.icons.names.bus" },
  train: { Icon: TrainFront, name: "budget.icons.names.train" },
  bike: { Icon: Bike, name: "budget.icons.names.bike" },
  plane: { Icon: Plane, name: "budget.icons.names.plane" },
  "shopping-cart": { Icon: ShoppingCart, name: "budget.icons.names.shoppingCart" },
  utensils: { Icon: Utensils, name: "budget.icons.names.utensils" },
  coffee: { Icon: Coffee, name: "budget.icons.names.coffee" },
  "heart-pulse": { Icon: HeartPulse, name: "budget.icons.names.heartPulse" },
  pill: { Icon: Pill, name: "budget.icons.names.pill" },
  dumbbell: { Icon: Dumbbell, name: "budget.icons.names.dumbbell" },
  scissors: { Icon: Scissors, name: "budget.icons.names.scissors" },
  baby: { Icon: Baby, name: "budget.icons.names.baby" },
  "paw-print": { Icon: PawPrint, name: "budget.icons.names.pawPrint" },
  "graduation-cap": { Icon: GraduationCap, name: "budget.icons.names.graduationCap" },
  "book-open": { Icon: BookOpen, name: "budget.icons.names.bookOpen" },
  gift: { Icon: Gift, name: "budget.icons.names.gift" },
  gamepad: { Icon: Gamepad2, name: "budget.icons.names.gamepad" },
  music: { Icon: EighthNotes, name: "budget.icons.names.music" },
  ticket: { Icon: Ticket, name: "budget.icons.names.ticket" },
  "tree-palm": { Icon: TreePalm, name: "budget.icons.names.treePalm" },
  camera: { Icon: Camera, name: "budget.icons.names.camera" },
  "piggy-bank": { Icon: PiggyBank, name: "budget.icons.names.piggyBank" },
  wallet: { Icon: Wallet, name: "budget.icons.names.wallet" },
  "credit-card": { Icon: CreditCard, name: "budget.icons.names.creditCard" },
  landmark: { Icon: Landmark, name: "budget.icons.names.landmark" },
  receipt: { Icon: Receipt, name: "budget.icons.names.receipt" },
  shield: { Icon: Shield, name: "budget.icons.names.shield" },
  umbrella: { Icon: Umbrella, name: "budget.icons.names.umbrella" },
  "hand-coins": { Icon: HandCoins, name: "budget.icons.names.handCoins" },
  briefcase: { Icon: Briefcase, name: "budget.icons.names.briefcase" },
  shirt: { Icon: Shirt, name: "budget.icons.names.shirt" },
};

/**
 * The icon that starts a category's row, in its group's colour: the one
 * chosen for it, or the envelope. Every icon takes the envelope's place, so
 * the names after them line up.
 */
export function CategoryGlyph({ icon, color }: { icon?: CategoryIcon; color: string }) {
  const Icon = icon && iconDrawings[icon].Icon;
  return (
    <span className="flex h-6 w-[26px] shrink-0 items-center justify-center">
      {Icon ? <Icon size={24} color={color} strokeWidth={1.9} /> : <EnvelopeToken color={color} />}
    </span>
  );
}
