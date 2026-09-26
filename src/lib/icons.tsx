/**
 * Drop-in Lucide → Phosphor (Fill weight) aliases.
 * App code imports from here; shadcn ui/ components keep lucide-react.
 */
import {
  WarningCircle as _WarningCircle,
  Warning as _Warning,
  ArrowDown as _ArrowDown,
  ArrowLeft as _ArrowLeft,
  ArrowRight as _ArrowRight,
  ArrowsDownUp as _ArrowsDownUp,
  ArrowCounterClockwise as _ArrowCCW,
  Bathtub as _Bathtub,
  Bed as _Bed,
  Buildings as _Buildings,
  CalendarDots as _CalendarDots,
  Calendar as _Calendar,
  Check as _Check,
  CheckCircle as _CheckCircle,
  CaretDown as _CaretDown,
  CaretLeft as _CaretLeft,
  CaretRight as _CaretRight,
  CaretUp as _CaretUp,
  Clock as _Clock,
  ClockCounterClockwise as _ClockCCW,
  ArrowSquareOut as _ArrowSquareOut,
  Eye as _Eye,
  Fire as _Fire,
  GraduationCap as _GraduationCap,
  DotsSixVertical as _DotsSixVertical,
  Heart as _Heart,
  Question as _Question,
  House as _House,
  Tray as _Tray,
  List as _List,
  CircleNotch as _CircleNotch,
  Lock as _Lock,
  SignOut as _SignOut,
  Envelope as _Envelope,
  MapPin as _MapPin,
  MapPinLine as _MapPinLine,
  ArrowsOut as _ArrowsOut,
  ChatCircle as _ChatCircle,
  Minus as _Minus,
  DotsThree as _DotsThree,
  SidebarSimple as _SidebarSimple,
  Plus as _Plus,
  MagnifyingGlass as _MagnifyingGlass,
  ShieldCheck as _ShieldCheck,
  Star as _Star,
  UserPlus as _UserPlus,
  Users as _Users,
  X as _X,
  XCircle as _XCircle,
  Car as _Car,
  Stack as _Stack,
  MapTrifold as _MapTrifold,
  Pulse as _Pulse,
  Baby as _Baby,
  Prohibit as _Prohibit,
  ChartBar as _ChartBar,
  Bell as _Bell,
  BellRinging as _BellRinging,
  Briefcase as _Briefcase,
  Calculator as _Calculator,
  Camera as _Camera,
  ClipboardText as _ClipboardText,
  Coffee as _Coffee,
  CreditCard as _CreditCard,
  Door as _Door,
  Barbell as _Barbell,
  GitDiff as _GitDiff,
  Globe as _Globe,
  Key as _Key,
  SquaresFour as _SquaresFour,
  Gear as _Gear,
  Elevator as _Elevator,
  BookOpen as _BookOpen,
  Drop as _Drop,
  Package as _Package,
  RoadHorizon as _Road,
  Sun as _Sun,
  Binoculars as _Binoculars,
  ArrowUp as _ArrowUp,
  ShareNetwork as _ShareNetwork,
  Shield as _Shield,
  ShieldWarning as _ShieldWarning,
  ShieldChevron as _ShieldChevron,
  ShoppingBag as _ShoppingBag,
  Sliders as _Sliders,
  Snowflake as _Snowflake,
  Couch as _Couch,
  Sparkle as _Sparkle,
  Storefront as _Storefront,
  Target as _Target,
  Train as _Train,
  Trash as _Trash,
  Tree as _Tree,
  TrendUp as _TrendUp,
  Trophy as _Trophy,
  User as _User,
  UserFocus as _UserFocus,
  ForkKnife as _ForkKnife,
  WashingMachine as _WashingMachine,
  Waves as _Waves,
  Wind as _Wind,
  Leaf as _Leaf,
  Info as _Info,
  Phone as _Phone,
  type Icon,
} from "@phosphor-icons/react";
import type { ComponentPropsWithoutRef } from "react";

type P<I extends Icon> = Omit<ComponentPropsWithoutRef<I>, "weight"> & {
  strokeWidth?: unknown;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fill = (I: Icon) => ({ strokeWidth: _, ...p }: P<any>) =>
  <I weight="fill" {...p} />;

// Lucide name → Phosphor fill
export const AlertCircle     = fill(_WarningCircle);
export const AlertTriangle   = fill(_Warning);
export const ArrowDown       = fill(_ArrowDown);
export const ArrowLeft       = fill(_ArrowLeft);
export const ArrowRight      = fill(_ArrowRight);
export const ArrowUpDown     = fill(_ArrowsDownUp);
export const Bath            = fill(_Bathtub);
export const Bed             = fill(_Bed);
export const BedDouble       = fill(_Bed);
export const Building2       = fill(_Buildings);
export const CalendarClock   = fill(_CalendarDots);
export const Calendar        = fill(_Calendar);
export const Check           = fill(_Check);
export const CheckCircle     = fill(_CheckCircle);
export const ChevronDown     = fill(_CaretDown);
export const ChevronDownIcon = fill(_CaretDown);
export const ChevronLeft     = fill(_CaretLeft);
export const ChevronLeftIcon = fill(_CaretLeft);
export const ChevronRight    = fill(_CaretRight);
export const ChevronRightIcon = fill(_CaretRight);
export const ChevronUp       = fill(_CaretUp);
export const Clock           = fill(_Clock);
export const ExternalLink    = fill(_ArrowSquareOut);
export const Eye             = fill(_Eye);
export const Flame           = fill(_Fire);
export const GraduationCap   = fill(_GraduationCap);
export const GripVertical    = fill(_DotsSixVertical);
export const Heart           = fill(_Heart);
export const HelpCircle      = fill(_Question);
export const Home            = fill(_House);
export const Inbox           = fill(_Tray);
export const List            = fill(_List);
export const Loader2         = fill(_CircleNotch);
export const Lock            = fill(_Lock);
export const LogOut          = fill(_SignOut);
export const Mail            = fill(_Envelope);
export const Map             = fill(_MapTrifold);
export const MapIcon         = fill(_MapTrifold);
export const MapPin          = fill(_MapPin);
export const MapPinned       = fill(_MapPinLine);
export const Maximize2       = fill(_ArrowsOut);
export const Menu            = fill(_List);
export const MessageCircle   = fill(_ChatCircle);
export const Minus           = fill(_Minus);
export const MoreHorizontal  = fill(_DotsThree);
export const PanelLeft       = fill(_SidebarSimple);
export const Plus            = fill(_Plus);
export const Search          = fill(_MagnifyingGlass);
export const ShieldCheck     = fill(_ShieldCheck);
export const Star            = fill(_Star);
export const UserPlus        = fill(_UserPlus);
export const Users           = fill(_Users);
export const X               = fill(_X);
export const XCircle         = fill(_XCircle);
export const Car             = fill(_Car);
export const Layers          = fill(_Stack);
// Additional icons
export const Activity        = fill(_Pulse);
export const Baby            = fill(_Baby);
export const Ban             = fill(_Prohibit);
export const BarChart2       = fill(_ChartBar);
export const Bell            = fill(_Bell);
export const BellRing        = fill(_BellRinging);
export const Briefcase       = fill(_Briefcase);
export const Calculator      = fill(_Calculator);
export const Camera          = fill(_Camera);
export const ClipboardList   = fill(_ClipboardText);
export const Coffee          = fill(_Coffee);
export const CreditCard      = fill(_CreditCard);
export const DoorClosed      = fill(_Door);
export const Dumbbell        = fill(_Barbell);
export const GitCompare      = fill(_GitDiff);
export const Globe2          = fill(_Globe);
export const History         = fill(_ClockCCW);
export const Info            = fill(_Info);
export const KeyRound        = fill(_Key);
export const LayoutDashboard = fill(_SquaresFour);
export const Leaf            = fill(_Leaf);
export const Phone           = fill(_Phone);
export const RotateCcw       = fill(_ArrowCCW);
export const Settings        = fill(_Gear);
export const Share2          = fill(_ShareNetwork);
export const Shield          = fill(_Shield);
export const ShieldAlert     = fill(_ShieldWarning);
export const ShieldHalf      = fill(_ShieldChevron);
export const ShoppingBag     = fill(_ShoppingBag);
export const SlidersHorizontal = fill(_Sliders);
export const Snowflake       = fill(_Snowflake);
export const Sofa            = fill(_Couch);
export const Sparkles        = fill(_Sparkle);
export const Store           = fill(_Storefront);
export const Target          = fill(_Target);
export const Train           = fill(_Train);
export const TrainFront      = fill(_Train);
export const Trash2          = fill(_Trash);
export const Trees           = fill(_Tree);
export const TrendingUp      = fill(_TrendUp);
export const Trophy          = fill(_Trophy);
export const User            = fill(_User);
export const UserSearch      = fill(_UserFocus);
export const Utensils        = fill(_ForkKnife);
export const UtensilsCrossed = fill(_ForkKnife);
export const WashingMachine  = fill(_WashingMachine);
export const Waves           = fill(_Waves);
export const Wind            = fill(_Wind);
export const Elevator        = fill(_Elevator);
export const BookOpen        = fill(_BookOpen);
export const Drop            = fill(_Drop);
export const Package         = fill(_Package);
export const Road            = fill(_Road);
export const Sun             = fill(_Sun);
export const Binoculars      = fill(_Binoculars);
export const ArrowUp         = fill(_ArrowUp);
