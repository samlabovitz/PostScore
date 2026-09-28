// Trade search: lets a new owner find their specific trade ("roofer",
// "zapatero") during business setup, and resolves it to one of the 39
// business type ids in config/bizProfiles.ts so the rest of the app
// (competitor wording, FAQ, coupon presets, starter-site CTA) gets
// copy that actually fits. Pure data + search logic only — no UI here.
//
// Mapping rule: a trade maps to a real business type id ONLY when that
// type's actual copy fits it (see config/bizProfiles.ts's per-type
// content). A handful of trades below still have no good fit among the
// 39 ids and are honestly mapped to "default" rather than forced into
// a wrong one — see ~/Desktop/trade-list-review-2.md for the trades
// that remain unmapped and why.
//
// Day 2, step 2: the 8 new types this file's trades were originally
// tagged with a `plannedTypeId` for (home_services, repair_dropoff,
// recreation, events, car_wash_detailing, childcare, lodging,
// tattoo_body_art) now exist for real in config/bizProfiles.ts, so
// every trade that carried one has had it promoted straight into
// `businessTypeId` — the `plannedTypeId` field itself is gone.

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/** The 39 ids BUSINESS_TYPE_OPTIONS defines in config/bizProfiles.ts —
 * kept as a literal union (not imported) so this file has no risk of a
 * circular import with bizProfiles.ts; tradeSearch.test.ts cross-checks
 * this list against getBizProfileOptions() so the two can never drift
 * silently. */
export type BusinessTypeId =
  | "barbershop"
  | "spa"
  | "nail_salon"
  | "salon"
  | "cafe"
  | "bar"
  | "bakery"
  | "liquor_store"
  | "grocery_market"
  | "restaurant"
  | "hardware_store"
  | "florist"
  | "retail_boutique"
  | "gym_fitness"
  | "pet_services"
  | "dentist"
  | "medical_clinic"
  | "lawyer"
  | "accountant"
  | "real_estate"
  | "consultant"
  | "coach"
  | "tutor_education"
  | "photographer"
  | "practitioner"
  | "auto_repair"
  | "plumber"
  | "electrician"
  | "landscaper"
  | "cleaning_service"
  | "home_services"
  | "repair_dropoff"
  | "recreation"
  | "events"
  | "car_wash_detailing"
  | "childcare"
  | "lodging"
  | "tattoo_body_art"
  | "default";

export interface TradeEntry {
  id: string;
  nameEn: string;
  nameEs: string;
  synonymsEn: string[];
  synonymsEs: string[];
  businessTypeId: BusinessTypeId;
}

export const TRADES: TradeEntry[] = [
  // ---- Construction & home services -------------------------------
  // Most of these have no genuinely fitting existing type (see the gap
  // report's "Construction & Contractors" cluster); a handful of
  // landscaping-adjacent ones honestly fit "landscaper".
  { id: "general_contractor", nameEn: "General Contractor", nameEs: "Contratista general", synonymsEn: ["contractor", "construction company", "GC"], synonymsEs: ["constructor", "empresa de construcción"], businessTypeId: "home_services" },
  { id: "roofer", nameEn: "Roofer", nameEs: "Techero", synonymsEn: ["roofing contractor", "roof repair", "roof replacement"], synonymsEs: ["contratista de techos", "reparación de techos"], businessTypeId: "home_services" },
  { id: "hvac_contractor", nameEn: "HVAC Contractor", nameEs: "Contratista de climatización", synonymsEn: ["heating and air conditioning", "AC repair", "furnace repair"], synonymsEs: ["aire acondicionado", "calefacción", "reparación de aire acondicionado"], businessTypeId: "home_services" },
  { id: "painter", nameEn: "Painter", nameEs: "Pintor", synonymsEn: ["house painter", "painting contractor", "interior painting", "exterior painting"], synonymsEs: ["pintor de casas", "contratista de pintura"], businessTypeId: "home_services" },
  { id: "flooring_installer", nameEn: "Flooring Installer", nameEs: "Instalador de pisos", synonymsEn: ["flooring contractor", "floor installation"], synonymsEs: ["instalación de pisos", "contratista de pisos"], businessTypeId: "home_services" },
  { id: "remodeling_contractor", nameEn: "Remodeling Contractor", nameEs: "Contratista de remodelación", synonymsEn: ["home renovation", "renovation contractor"], synonymsEs: ["renovación de casas", "remodelación"], businessTypeId: "home_services" },
  { id: "concrete_contractor", nameEn: "Concrete Contractor", nameEs: "Contratista de concreto", synonymsEn: ["concrete company", "cement contractor"], synonymsEs: ["contratista de cemento", "empresa de concreto"], businessTypeId: "home_services" },
  { id: "fencing_contractor", nameEn: "Fencing Contractor", nameEs: "Contratista de cercas", synonymsEn: ["fence installer", "fence company"], synonymsEs: ["instalador de cercas", "empresa de cercas"], businessTypeId: "home_services" },
  { id: "pool_service", nameEn: "Pool Service", nameEs: "Servicio de piscinas", synonymsEn: ["pool cleaning", "pool maintenance"], synonymsEs: ["limpieza de piscinas", "mantenimiento de piscinas"], businessTypeId: "home_services" },
  { id: "pest_control", nameEn: "Pest Control", nameEs: "Control de plagas", synonymsEn: ["exterminator", "pest exterminator"], synonymsEs: ["exterminador", "fumigación"], businessTypeId: "home_services" },
  { id: "handyman", nameEn: "Handyman", nameEs: "Reparaciones generales del hogar", synonymsEn: ["handyman service", "home repair"], synonymsEs: ["servicio de reparaciones", "reparaciones del hogar"], businessTypeId: "home_services" },
  { id: "drywall_contractor", nameEn: "Drywall Contractor", nameEs: "Contratista de tablaroca", synonymsEn: ["drywall installation", "sheetrock"], synonymsEs: ["instalación de tablaroca", "yeso"], businessTypeId: "home_services" },
  { id: "insulation_contractor", nameEn: "Insulation Contractor", nameEs: "Contratista de aislamiento", synonymsEn: ["home insulation", "spray foam insulation"], synonymsEs: ["aislamiento térmico", "aislamiento de espuma"], businessTypeId: "home_services" },
  { id: "siding_contractor", nameEn: "Siding Contractor", nameEs: "Contratista de revestimiento", synonymsEn: ["vinyl siding", "siding installation"], synonymsEs: ["revestimiento exterior", "instalación de revestimiento"], businessTypeId: "home_services" },
  { id: "gutter_services", nameEn: "Gutter Installation & Cleaning", nameEs: "Instalación y limpieza de canaletas", synonymsEn: ["gutter cleaning", "gutter installer", "gutter guards"], synonymsEs: ["limpieza de canaletas", "instalación de canaletas"], businessTypeId: "home_services" },
  { id: "deck_builder", nameEn: "Deck Builder", nameEs: "Constructor de terrazas", synonymsEn: ["deck construction", "deck contractor"], synonymsEs: ["construcción de terrazas", "contratista de terrazas"], businessTypeId: "home_services" },
  { id: "garage_door_repair", nameEn: "Garage Door Repair & Installation", nameEs: "Reparación e instalación de puertas de garaje", synonymsEn: ["garage door installer", "garage door opener repair"], synonymsEs: ["instalador de puertas de garaje"], businessTypeId: "home_services" },
  { id: "paving_contractor", nameEn: "Paving & Asphalt Contractor", nameEs: "Contratista de pavimentación", synonymsEn: ["asphalt paving", "driveway paving"], synonymsEs: ["pavimentación de asfalto", "pavimentación de entradas"], businessTypeId: "home_services" },
  { id: "masonry_contractor", nameEn: "Masonry & Brick Contractor", nameEs: "Contratista de albañilería", synonymsEn: ["bricklayer", "stone mason"], synonymsEs: ["albañil", "cantero"], businessTypeId: "home_services" },
  { id: "tile_installer", nameEn: "Tile Installer", nameEs: "Instalador de azulejos", synonymsEn: ["tile contractor", "tiling"], synonymsEs: ["contratista de azulejos", "colocación de baldosas"], businessTypeId: "home_services" },
  { id: "waterproofing_contractor", nameEn: "Waterproofing Contractor", nameEs: "Contratista de impermeabilización", synonymsEn: ["basement waterproofing"], synonymsEs: ["impermeabilización de sótanos"], businessTypeId: "home_services" },
  { id: "foundation_repair", nameEn: "Foundation Repair Contractor", nameEs: "Reparación de cimientos", synonymsEn: ["foundation contractor", "foundation crack repair"], synonymsEs: ["contratista de cimientos"], businessTypeId: "home_services" },
  { id: "stucco_contractor", nameEn: "Stucco Contractor", nameEs: "Contratista de estuco", synonymsEn: ["stucco repair", "plastering"], synonymsEs: ["reparación de estuco", "yesería"], businessTypeId: "home_services" },
  { id: "welding_fabrication", nameEn: "Welding & Metal Fabrication", nameEs: "Soldadura y fabricación de metal", synonymsEn: ["welder", "custom metalwork"], synonymsEs: ["soldador", "trabajo en metal"], businessTypeId: "home_services" },
  { id: "glazier", nameEn: "Glass & Mirror / Glazier", nameEs: "Vidriería", synonymsEn: ["glass repair", "mirror installation", "window glass replacement"], synonymsEs: ["reparación de vidrios", "instalación de espejos"], businessTypeId: "home_services" },
  { id: "cabinet_maker", nameEn: "Cabinet Maker", nameEs: "Fabricante de gabinetes", synonymsEn: ["custom cabinetry", "cabinetry"], synonymsEs: ["gabinetes a medida", "carpintería de gabinetes"], businessTypeId: "home_services" },
  { id: "countertop_installer", nameEn: "Countertop Installer", nameEs: "Instalador de cubiertas de cocina", synonymsEn: ["granite countertops", "quartz countertops"], synonymsEs: ["encimeras de granito", "encimeras de cuarzo"], businessTypeId: "home_services" },
  { id: "solar_installer", nameEn: "Solar Panel Installer", nameEs: "Instalador de paneles solares", synonymsEn: ["solar company", "solar energy installer"], synonymsEs: ["empresa de energía solar"], businessTypeId: "home_services" },
  { id: "home_inspector", nameEn: "Home Inspector", nameEs: "Inspector de viviendas", synonymsEn: ["home inspection service"], synonymsEs: ["inspección de viviendas"], businessTypeId: "home_services" },
  { id: "chimney_sweep", nameEn: "Chimney Sweep & Repair", nameEs: "Deshollinador y reparación de chimeneas", synonymsEn: ["chimney cleaning", "chimney repair"], synonymsEs: ["limpieza de chimeneas"], businessTypeId: "home_services" },
  { id: "awning_installer", nameEn: "Awning Installer", nameEs: "Instalador de toldos", synonymsEn: ["awning company", "canopy installer"], synonymsEs: ["empresa de toldos"], businessTypeId: "home_services" },
  { id: "water_heater_installer", nameEn: "Water Heater Installation & Repair", nameEs: "Instalación y reparación de calentadores de agua", synonymsEn: ["water heater repair", "tankless water heater"], synonymsEs: ["reparación de calentadores"], businessTypeId: "home_services" },
  { id: "generator_installer", nameEn: "Generator Installation & Repair", nameEs: "Instalación y reparación de generadores", synonymsEn: ["backup generator", "generator repair"], synonymsEs: ["generador de respaldo"], businessTypeId: "home_services" },
  { id: "security_system_installer", nameEn: "Security System Installer", nameEs: "Instalador de sistemas de seguridad", synonymsEn: ["home security installation", "camera system installer"], synonymsEs: ["instalación de cámaras de seguridad"], businessTypeId: "home_services" },
  { id: "home_theater_installer", nameEn: "Home Theater / AV Installer", nameEs: "Instalador de cine en casa / AV", synonymsEn: ["audio visual installer", "surround sound installer"], synonymsEs: ["instalador audiovisual"], businessTypeId: "home_services" },
  { id: "smart_home_installer", nameEn: "Smart Home Installer", nameEs: "Instalador de casa inteligente", synonymsEn: ["home automation installer"], synonymsEs: ["automatización del hogar"], businessTypeId: "home_services" },
  { id: "window_cleaning", nameEn: "Window Cleaning", nameEs: "Limpieza de ventanas", synonymsEn: ["window washer", "window washing service"], synonymsEs: ["lavado de ventanas"], businessTypeId: "cleaning_service" },
  { id: "pressure_washing", nameEn: "Pressure Washing", nameEs: "Lavado a presión", synonymsEn: ["power washing", "exterior house washing"], synonymsEs: ["hidrolavado", "lavado a presión de exteriores"], businessTypeId: "cleaning_service" },
  { id: "septic_service", nameEn: "Septic Tank Service", nameEs: "Servicio de fosas sépticas", synonymsEn: ["septic tank pumping", "septic repair"], synonymsEs: ["bombeo de fosas sépticas"], businessTypeId: "home_services" },
  { id: "well_drilling", nameEn: "Well Drilling & Pump Repair", nameEs: "Perforación de pozos y reparación de bombas", synonymsEn: ["water well driller", "well pump repair"], synonymsEs: ["perforación de pozos de agua"], businessTypeId: "home_services" },
  { id: "water_damage_restoration", nameEn: "Water Damage & Mold Restoration", nameEs: "Restauración por daños de agua y moho", synonymsEn: ["mold remediation", "flood damage repair"], synonymsEs: ["remediación de moho", "restauración por inundación"], businessTypeId: "home_services" },
  { id: "kitchen_bath_remodeler", nameEn: "Kitchen & Bath Remodeler", nameEs: "Remodelador de cocinas y baños", synonymsEn: ["bathroom remodeler", "kitchen renovation"], synonymsEs: ["remodelación de baños", "renovación de cocinas"], businessTypeId: "home_services" },
  { id: "basement_finishing", nameEn: "Basement Finishing Contractor", nameEs: "Contratista de acabado de sótanos", synonymsEn: ["basement remodel", "basement conversion"], synonymsEs: ["remodelación de sótanos"], businessTypeId: "home_services" },
  { id: "home_addition_builder", nameEn: "Home Addition / ADU Builder", nameEs: "Constructor de ampliaciones", synonymsEn: ["room addition", "ADU builder", "accessory dwelling unit"], synonymsEs: ["ampliación de casa"], businessTypeId: "home_services" },
  { id: "epoxy_flooring", nameEn: "Epoxy Garage Flooring", nameEs: "Piso epóxico para garaje", synonymsEn: ["epoxy floor coating"], synonymsEs: ["recubrimiento epóxico de pisos"], businessTypeId: "home_services" },
  { id: "radon_mitigation", nameEn: "Radon Mitigation", nameEs: "Mitigación de radón", synonymsEn: ["radon testing"], synonymsEs: ["prueba de radón"], businessTypeId: "home_services" },
  { id: "home_elevator_installer", nameEn: "Home Elevator & Lift Installer", nameEs: "Instalador de elevadores residenciales", synonymsEn: ["stair lift installer", "residential elevator"], synonymsEs: ["instalador de sillas salvaescaleras"], businessTypeId: "home_services" },
  { id: "accessibility_ramp_installer", nameEn: "Wheelchair Ramp & Accessibility Contractor", nameEs: "Contratista de rampas de accesibilidad", synonymsEn: ["ADA modifications", "ramp installer"], synonymsEs: ["modificaciones de accesibilidad"], businessTypeId: "home_services" },
  { id: "soundproofing_contractor", nameEn: "Soundproofing Contractor", nameEs: "Contratista de insonorización", synonymsEn: ["sound insulation"], synonymsEs: ["aislamiento acústico"], businessTypeId: "home_services" },
  { id: "garage_conversion", nameEn: "Garage Conversion Contractor", nameEs: "Contratista de conversión de garajes", synonymsEn: ["garage to living space"], synonymsEs: ["conversión de garaje"], businessTypeId: "home_services" },
  { id: "deck_staining", nameEn: "Deck Staining & Refinishing", nameEs: "Tinte y restauración de terrazas", synonymsEn: ["deck refinishing", "deck sealing"], synonymsEs: ["restauración de terrazas"], businessTypeId: "home_services" },
  { id: "fence_staining_repair", nameEn: "Fence Staining & Repair", nameEs: "Tinte y reparación de cercas", synonymsEn: ["fence repair"], synonymsEs: ["reparación de cercas"], businessTypeId: "home_services" },
  { id: "driveway_sealing", nameEn: "Driveway Sealing", nameEs: "Sellado de entradas de auto", synonymsEn: ["asphalt sealcoating"], synonymsEs: ["sellado de asfalto"], businessTypeId: "home_services" },
  { id: "window_installer", nameEn: "Window Installation & Replacement", nameEs: "Instalación y reemplazo de ventanas", synonymsEn: ["window replacement company"], synonymsEs: ["reemplazo de ventanas"], businessTypeId: "home_services" },
  { id: "door_installer", nameEn: "Door Installation & Repair", nameEs: "Instalación y reparación de puertas", synonymsEn: ["door installer", "entry door replacement"], synonymsEs: ["instalador de puertas"], businessTypeId: "home_services" },
  { id: "skylight_installer", nameEn: "Skylight Installation", nameEs: "Instalación de tragaluces", synonymsEn: ["skylight installer"], synonymsEs: ["instalador de tragaluces"], businessTypeId: "home_services" },
  { id: "fireplace_installer", nameEn: "Fireplace Installation & Repair", nameEs: "Instalación y reparación de chimeneas", synonymsEn: ["fireplace contractor"], synonymsEs: ["contratista de chimeneas"], businessTypeId: "home_services" },
  { id: "crawl_space_encapsulation", nameEn: "Crawl Space Encapsulation", nameEs: "Encapsulado de espacio de acceso", synonymsEn: ["crawl space repair"], synonymsEs: ["reparación de espacio de acceso"], businessTypeId: "home_services" },
  { id: "home_energy_auditor", nameEn: "Home Energy Auditor", nameEs: "Auditor de energía del hogar", synonymsEn: ["energy audit service"], synonymsEs: ["auditoría energética"], businessTypeId: "home_services" },
  { id: "screened_porch_builder", nameEn: "Screened Porch / Sunroom Builder", nameEs: "Constructor de porches con mosquitero", synonymsEn: ["sunroom contractor", "porch enclosure"], synonymsEs: ["constructor de sunrooms"], businessTypeId: "home_services" },
  { id: "carpet_installer", nameEn: "Carpet Installation", nameEs: "Instalación de alfombras", synonymsEn: ["carpet installer"], synonymsEs: ["instalador de alfombras"], businessTypeId: "home_services" },
  { id: "hardwood_floor_refinishing", nameEn: "Hardwood Floor Refinishing", nameEs: "Restauración de pisos de madera", synonymsEn: ["floor sanding and refinishing"], synonymsEs: ["pulido de pisos de madera"], businessTypeId: "home_services" },
  { id: "pool_construction", nameEn: "Pool Installation & Construction", nameEs: "Construcción e instalación de piscinas", synonymsEn: ["pool builder", "inground pool installer"], synonymsEs: ["constructor de piscinas"], businessTypeId: "home_services" },
  { id: "hot_tub_installer", nameEn: "Hot Tub & Spa Installation/Repair", nameEs: "Instalación y reparación de jacuzzis", synonymsEn: ["spa repair", "hot tub repair"], synonymsEs: ["reparación de jacuzzis"], businessTypeId: "home_services" },
  { id: "outdoor_kitchen_builder", nameEn: "Outdoor Kitchen Builder", nameEs: "Constructor de cocinas al aire libre", synonymsEn: ["outdoor kitchen contractor"], synonymsEs: ["cocinas exteriores"], businessTypeId: "home_services" },
  { id: "playground_installer", nameEn: "Playground Equipment Installer", nameEs: "Instalador de equipos de juegos infantiles", synonymsEn: ["play set installer", "swing set installer"], synonymsEs: ["instalador de juegos infantiles"], businessTypeId: "home_services" },
  { id: "shed_builder", nameEn: "Shed Builder", nameEs: "Constructor de cobertizos", synonymsEn: ["storage shed contractor"], synonymsEs: ["constructor de casetas"], businessTypeId: "home_services" },
  { id: "barn_builder", nameEn: "Barn Builder", nameEs: "Constructor de graneros", synonymsEn: ["pole barn contractor"], synonymsEs: ["constructor de establos"], businessTypeId: "home_services" },
  { id: "duct_cleaning", nameEn: "Air Duct Cleaning", nameEs: "Limpieza de ductos de aire", synonymsEn: ["HVAC duct cleaning"], synonymsEs: ["limpieza de conductos de aire"], businessTypeId: "cleaning_service" },
  { id: "dryer_vent_cleaning", nameEn: "Dryer Vent Cleaning", nameEs: "Limpieza de ductos de secadora", synonymsEn: ["dryer vent cleaner"], synonymsEs: ["limpieza de ventilación de secadora"], businessTypeId: "cleaning_service" },
  { id: "handrail_installer", nameEn: "Handrail & Railing Installer", nameEs: "Instalador de barandales", synonymsEn: ["railing contractor", "stair railing"], synonymsEs: ["contratista de barandales"], businessTypeId: "home_services" },
  { id: "automated_gate_installer", nameEn: "Automated Gate Installer", nameEs: "Instalador de portones automáticos", synonymsEn: ["driveway gate installer", "gate automation"], synonymsEs: ["portones eléctricos"], businessTypeId: "home_services" },
  { id: "water_treatment_installer", nameEn: "Water Treatment & Filtration Installer", nameEs: "Instalador de tratamiento de agua", synonymsEn: ["water softener installer", "whole house filtration"], synonymsEs: ["ablandadores de agua"], businessTypeId: "home_services" },
  { id: "backflow_testing", nameEn: "Backflow Testing Service", nameEs: "Servicio de prueba de retroflujo", synonymsEn: ["backflow preventer testing"], synonymsEs: ["prueba de válvulas antirretorno"], businessTypeId: "home_services" },
  { id: "fire_extinguisher_inspection", nameEn: "Fire Extinguisher Inspection Service", nameEs: "Inspección de extintores", synonymsEn: ["fire safety inspection"], synonymsEs: ["inspección de seguridad contra incendios"], businessTypeId: "home_services" },
  { id: "elevator_maintenance", nameEn: "Elevator Maintenance", nameEs: "Mantenimiento de elevadores", synonymsEn: ["commercial elevator service"], synonymsEs: ["servicio de elevadores comerciales"], businessTypeId: "home_services" },
  { id: "commercial_hood_cleaning", nameEn: "Commercial Kitchen Hood Cleaning", nameEs: "Limpieza de campanas de cocina comercial", synonymsEn: ["exhaust hood cleaning"], synonymsEs: ["limpieza de campanas extractoras"], businessTypeId: "cleaning_service" },

  // Landscaping-adjacent — genuinely fit "landscaper" (its own match
  // list already includes "lawn care" and "tree service").
  { id: "tree_service", nameEn: "Tree Service", nameEs: "Servicio de poda de árboles", synonymsEn: ["tree removal", "arborist", "tree trimming"], synonymsEs: ["remoción de árboles", "arbolista", "poda de árboles"], businessTypeId: "landscaper" },
  { id: "lawn_care", nameEn: "Lawn Care", nameEs: "Cuidado de césped", synonymsEn: ["lawn mowing", "lawn maintenance"], synonymsEs: ["corte de césped", "mantenimiento de jardín"], businessTypeId: "landscaper" },
  { id: "irrigation_installer", nameEn: "Irrigation & Sprinkler System Installer", nameEs: "Instalador de sistemas de riego", synonymsEn: ["sprinkler repair", "irrigation contractor"], synonymsEs: ["reparación de aspersores"], businessTypeId: "landscaper" },
  { id: "snow_removal", nameEn: "Snow Removal", nameEs: "Remoción de nieve", synonymsEn: ["snow plowing", "snow shoveling service"], synonymsEs: ["quitanieves", "servicio de nieve"], businessTypeId: "landscaper" },
  { id: "hardscaping", nameEn: "Hardscaping & Paver Installer", nameEs: "Instalador de adoquines y paisajismo duro", synonymsEn: ["paver patio installer", "hardscape contractor"], synonymsEs: ["instalación de adoquines"], businessTypeId: "landscaper" },
  { id: "retaining_wall_builder", nameEn: "Retaining Wall Builder", nameEs: "Constructor de muros de contención", synonymsEn: ["retaining wall contractor"], synonymsEs: ["contratista de muros de contención"], businessTypeId: "landscaper" },

  // ---- Repair services ----------------------------------------------
  { id: "shoe_repair", nameEn: "Shoe Repair", nameEs: "Reparación de calzado", synonymsEn: ["cobbler", "shoe cleaner", "shoe resoling"], synonymsEs: ["zapatero","limpieza de calzado","zapatería"], businessTypeId: "repair_dropoff" },
  { id: "tailor_alterations", nameEn: "Tailor / Alterations", nameEs: "Sastrería / Arreglos de ropa", synonymsEn: ["seamstress", "clothing alterations", "zipper repair"], synonymsEs: ["costurera", "modista", "arreglos de ropa"], businessTypeId: "repair_dropoff" },
  { id: "phone_repair", nameEn: "Phone Repair", nameEs: "Reparación de celulares", synonymsEn: ["cell phone repair", "screen repair"], synonymsEs: ["reparación de teléfonos", "reparación de pantallas"], businessTypeId: "repair_dropoff" },
  { id: "computer_repair", nameEn: "Computer Repair", nameEs: "Reparación de computadoras", synonymsEn: ["laptop repair", "PC repair shop"], synonymsEs: ["reparación de laptops", "taller de computadoras"], businessTypeId: "repair_dropoff" },
  { id: "watch_repair", nameEn: "Watch Repair", nameEs: "Reparación de relojes", synonymsEn: ["watchmaker"], synonymsEs: ["relojero"], businessTypeId: "repair_dropoff" },
  { id: "jewelry_repair", nameEn: "Jewelry Repair", nameEs: "Reparación de joyas", synonymsEn: ["jeweler repair shop", "ring resizing"], synonymsEs: ["joyero reparaciones", "ajuste de anillos"], businessTypeId: "repair_dropoff" },
  { id: "appliance_repair", nameEn: "Appliance Repair", nameEs: "Reparación de electrodomésticos", synonymsEn: ["washer and dryer repair", "refrigerator repair"], synonymsEs: ["reparación de lavadoras", "reparación de refrigeradores"], businessTypeId: "repair_dropoff" },
  { id: "bike_repair", nameEn: "Bike Repair", nameEs: "Reparación de bicicletas", synonymsEn: ["bicycle repair shop"], synonymsEs: ["taller de bicicletas"], businessTypeId: "repair_dropoff" },
  { id: "furniture_repair_upholstery", nameEn: "Furniture Repair & Upholstery", nameEs: "Reparación y tapicería de muebles", synonymsEn: ["upholsterer", "furniture reupholstery"], synonymsEs: ["tapicero", "retapizado de muebles"], businessTypeId: "repair_dropoff" },
  { id: "vacuum_repair", nameEn: "Vacuum Cleaner Repair", nameEs: "Reparación de aspiradoras", synonymsEn: ["vacuum repair shop"], synonymsEs: ["taller de aspiradoras"], businessTypeId: "repair_dropoff" },
  { id: "small_engine_repair", nameEn: "Lawn Mower & Small Engine Repair", nameEs: "Reparación de motores pequeños", synonymsEn: ["lawn mower repair", "small engine shop"], synonymsEs: ["reparación de cortacésped"], businessTypeId: "repair_dropoff" },
  { id: "instrument_repair", nameEn: "Musical Instrument Repair", nameEs: "Reparación de instrumentos musicales", synonymsEn: ["piano tuning", "guitar repair"], synonymsEs: ["afinación de pianos", "reparación de guitarras"], businessTypeId: "repair_dropoff" },
  { id: "locksmith", nameEn: "Locksmith", nameEs: "Cerrajero", synonymsEn: ["key cutting", "lock repair", "car key programming"], synonymsEs: ["duplicado de llaves", "reparación de cerraduras"], businessTypeId: "repair_dropoff" },
  { id: "clock_repair", nameEn: "Clock Repair", nameEs: "Reparación de relojes de pared", synonymsEn: ["clockmaker"], synonymsEs: ["relojero de pared"], businessTypeId: "repair_dropoff" },
  { id: "billiards_repair", nameEn: "Pool Table Repair", nameEs: "Reparación de mesas de billar", synonymsEn: ["billiards repair", "pool table moving"], synonymsEs: ["reparación de mesas de pool"], businessTypeId: "repair_dropoff" },
  { id: "camera_repair", nameEn: "Camera Repair", nameEs: "Reparación de cámaras", synonymsEn: ["camera repair shop"], synonymsEs: ["taller de cámaras"], businessTypeId: "repair_dropoff" },
  { id: "sewing_machine_repair", nameEn: "Sewing Machine Repair", nameEs: "Reparación de máquinas de coser", synonymsEn: ["sewing machine service"], synonymsEs: ["servicio de máquinas de coser"], businessTypeId: "repair_dropoff" },
  { id: "tv_repair", nameEn: "TV Repair", nameEs: "Reparación de televisores", synonymsEn: ["television repair shop"], synonymsEs: ["taller de televisores"], businessTypeId: "repair_dropoff" },
  { id: "electronics_repair", nameEn: "Electronics Repair", nameEs: "Reparación de electrónicos", synonymsEn: ["electronics repair shop"], synonymsEs: ["taller de electrónica"], businessTypeId: "repair_dropoff" },
  { id: "leather_repair", nameEn: "Leather & Handbag Repair", nameEs: "Reparación de artículos de piel", synonymsEn: ["leather goods repair", "handbag repair"], synonymsEs: ["reparación de bolsos", "reparación de cuero"], businessTypeId: "repair_dropoff" },
  { id: "lamp_repair", nameEn: "Lamp & Lighting Repair", nameEs: "Reparación de lámparas", synonymsEn: ["lamp rewiring"], synonymsEs: ["reparación de iluminación"], businessTypeId: "repair_dropoff" },
  { id: "antique_restoration", nameEn: "Antique Restoration", nameEs: "Restauración de antigüedades", synonymsEn: ["antique furniture restoration"], synonymsEs: ["restauración de muebles antiguos"], businessTypeId: "repair_dropoff" },
  { id: "picture_framing", nameEn: "Custom Picture Framing", nameEs: "Enmarcado de cuadros a medida", synonymsEn: ["frame shop"], synonymsEs: ["tienda de marcos"], businessTypeId: "retail_boutique" },
  { id: "luggage_repair", nameEn: "Luggage Repair", nameEs: "Reparación de maletas", synonymsEn: ["suitcase repair"], synonymsEs: ["reparación de equipaje"], businessTypeId: "repair_dropoff" },
  { id: "umbrella_repair", nameEn: "Umbrella Repair", nameEs: "Reparación de paraguas", synonymsEn: ["umbrella repair shop"], synonymsEs: ["taller de paraguas"], businessTypeId: "repair_dropoff" },
  { id: "shoe_shine", nameEn: "Shoe Shine", nameEs: "Bolero / Lustrado de calzado", synonymsEn: ["shoe shine stand"], synonymsEs: ["lustrado de zapatos"], businessTypeId: "repair_dropoff" },
  { id: "key_duplication", nameEn: "Key Duplication Kiosk", nameEs: "Duplicado de llaves", synonymsEn: ["key copying"], synonymsEs: ["copia de llaves"], businessTypeId: "repair_dropoff" },
  { id: "screen_door_repair", nameEn: "Screen Door & Window Screen Repair", nameEs: "Reparación de mosquiteros", synonymsEn: ["window screen repair"], synonymsEs: ["reparación de mallas"], businessTypeId: "repair_dropoff" },
  { id: "game_console_repair", nameEn: "Video Game Console Repair", nameEs: "Reparación de consolas de videojuegos", synonymsEn: ["console repair shop"], synonymsEs: ["taller de consolas"], businessTypeId: "repair_dropoff" },
  { id: "drone_repair", nameEn: "Drone Repair", nameEs: "Reparación de drones", synonymsEn: ["drone repair shop"], synonymsEs: ["taller de drones"], businessTypeId: "repair_dropoff" },
  { id: "power_tool_repair", nameEn: "Power Tool Repair", nameEs: "Reparación de herramientas eléctricas", synonymsEn: ["power tool repair shop"], synonymsEs: ["taller de herramientas"], businessTypeId: "repair_dropoff" },
  { id: "mobile_welding_repair", nameEn: "Mobile Welding Repair", nameEs: "Soldadura móvil de reparación", synonymsEn: ["on-site welding repair"], synonymsEs: ["soldadura a domicilio"], businessTypeId: "repair_dropoff" },
  { id: "mattress_repair", nameEn: "Mattress Repair & Recycling", nameEs: "Reparación y reciclaje de colchones", synonymsEn: ["mattress recycling"], synonymsEs: ["reciclaje de colchones"], businessTypeId: "repair_dropoff" },
  { id: "eyeglasses_repair", nameEn: "Eyeglasses Repair", nameEs: "Reparación de anteojos", synonymsEn: ["glasses repair shop"], synonymsEs: ["reparación de gafas"], businessTypeId: "repair_dropoff" },
  { id: "vending_arcade_repair", nameEn: "Vending & Arcade Machine Repair", nameEs: "Reparación de máquinas expendedoras", synonymsEn: ["arcade machine repair"], synonymsEs: ["reparación de máquinas de arcade"], businessTypeId: "repair_dropoff" },

  // ---- Fitness & wellness --------------------------------------------
  { id: "yoga_studio", nameEn: "Yoga Studio", nameEs: "Estudio de yoga", synonymsEn: ["yoga instructor", "hot yoga", "aerial yoga"], synonymsEs: ["instructor de yoga", "yoga caliente"], businessTypeId: "gym_fitness" },
  { id: "pilates_studio", nameEn: "Pilates Studio", nameEs: "Estudio de pilates", synonymsEn: ["pilates instructor", "reformer pilates"], synonymsEs: ["instructor de pilates"], businessTypeId: "gym_fitness" },
  { id: "martial_arts", nameEn: "Martial Arts Studio", nameEs: "Escuela de artes marciales", synonymsEn: ["karate", "jiu jitsu", "taekwondo", "dojo"], synonymsEs: ["karate", "jiu jitsu", "taekwondo"], businessTypeId: "gym_fitness" },
  { id: "boxing_gym", nameEn: "Boxing Gym", nameEs: "Gimnasio de boxeo", synonymsEn: ["boxing club", "kickboxing gym"], synonymsEs: ["club de boxeo"], businessTypeId: "gym_fitness" },
  { id: "climbing_gym", nameEn: "Climbing Gym", nameEs: "Gimnasio de escalada", synonymsEn: ["bouldering gym", "rock climbing gym"], synonymsEs: ["gimnasio de boulder"], businessTypeId: "gym_fitness" },
  { id: "spin_studio", nameEn: "Spin / Cycling Studio", nameEs: "Estudio de spinning", synonymsEn: ["indoor cycling studio"], synonymsEs: ["ciclismo indoor"], businessTypeId: "gym_fitness" },
  { id: "barre_studio", nameEn: "Barre Studio", nameEs: "Estudio de barre", synonymsEn: ["barre fitness"], synonymsEs: ["fitness de barra"], businessTypeId: "gym_fitness" },
  { id: "meditation_studio", nameEn: "Meditation Studio", nameEs: "Estudio de meditación", synonymsEn: ["mindfulness studio"], synonymsEs: ["estudio de mindfulness"], businessTypeId: "gym_fitness" },
  { id: "boot_camp_fitness", nameEn: "Boot Camp Fitness", nameEs: "Entrenamiento tipo boot camp", synonymsEn: ["group fitness bootcamp"], synonymsEs: ["campamento de fitness"], businessTypeId: "gym_fitness" },
  { id: "gymnastics_academy", nameEn: "Gymnastics Academy", nameEs: "Academia de gimnasia", synonymsEn: ["tumbling classes", "cheerleading academy"], synonymsEs: ["clases de gimnasia"], businessTypeId: "gym_fitness" },
  { id: "kickboxing_gym", nameEn: "Kickboxing Gym", nameEs: "Gimnasio de kickboxing", synonymsEn: ["muay thai gym"], synonymsEs: ["gimnasio de muay thai"], businessTypeId: "gym_fitness" },
  { id: "swim_club", nameEn: "Swim Club (Lap Swimming)", nameEs: "Club de natación", synonymsEn: ["masters swim club"], synonymsEs: ["club de natación para adultos"], businessTypeId: "gym_fitness" },
  { id: "tai_chi_studio", nameEn: "Tai Chi / Qigong Studio", nameEs: "Estudio de tai chi", synonymsEn: ["qigong classes"], synonymsEs: ["clases de qigong"], businessTypeId: "gym_fitness" },
  { id: "personal_trainer", nameEn: "Personal Trainer", nameEs: "Entrenador personal", synonymsEn: ["fitness instructor", "personal training studio"], synonymsEs: ["instructor de fitness"], businessTypeId: "practitioner" },
  { id: "dance_studio", nameEn: "Dance Studio", nameEs: "Estudio de baile", synonymsEn: ["ballet studio", "dance instructor"], synonymsEs: ["academia de baile", "estudio de ballet"], businessTypeId: "gym_fitness" },
  { id: "therapist_counselor", nameEn: "Therapist / Counselor", nameEs: "Terapeuta / Consejero", synonymsEn: ["mental health counseling", "psychotherapy"], synonymsEs: ["consejería", "psicoterapia"], businessTypeId: "practitioner" },
  { id: "sports_performance_training", nameEn: "Sports Performance Training", nameEs: "Entrenamiento de rendimiento deportivo", synonymsEn: ["athletic training studio"], synonymsEs: ["entrenamiento atlético"], businessTypeId: "practitioner" },
  { id: "life_coach", nameEn: "Life Coach", nameEs: "Coach de vida", synonymsEn: ["wellness coach"], synonymsEs: ["coach de bienestar"], businessTypeId: "coach" },
  { id: "business_coach", nameEn: "Business / Executive Coach", nameEs: "Coach de negocios", synonymsEn: ["executive coach"], synonymsEs: ["coach ejecutivo"], businessTypeId: "coach" },
  { id: "massage_therapy", nameEn: "Massage Therapy", nameEs: "Terapia de masajes", synonymsEn: ["massage therapist", "sports massage"], synonymsEs: ["masajista", "masaje deportivo"], businessTypeId: "spa" },
  { id: "reiki_energy_healing", nameEn: "Reiki / Energy Healing", nameEs: "Reiki / Sanación energética", synonymsEn: ["energy healer"], synonymsEs: ["sanador energético"], businessTypeId: "spa" },
  { id: "float_tank_spa", nameEn: "Float Tank Studio", nameEs: "Estudio de tanques de flotación", synonymsEn: ["sensory deprivation tank"], synonymsEs: ["tanque de aislamiento"], businessTypeId: "spa" },
  { id: "sauna_cryotherapy", nameEn: "Sauna & Cryotherapy Studio", nameEs: "Estudio de sauna y crioterapia", synonymsEn: ["cryotherapy studio"], synonymsEs: ["estudio de crioterapia"], businessTypeId: "spa" },
  { id: "reflexology_studio", nameEn: "Reflexology Studio", nameEs: "Estudio de reflexología", synonymsEn: ["foot reflexology"], synonymsEs: ["reflexología de pies"], businessTypeId: "spa" },
  { id: "rolfing_myofascial", nameEn: "Rolfing / Myofascial Release", nameEs: "Rolfing / Liberación miofascial", synonymsEn: ["structural integration"], synonymsEs: ["integración estructural"], businessTypeId: "practitioner" },
  { id: "chiropractor", nameEn: "Chiropractor", nameEs: "Quiropráctico", synonymsEn: ["chiropractic clinic"], synonymsEs: ["clínica quiropráctica"], businessTypeId: "medical_clinic" },
  { id: "physical_therapy", nameEn: "Physical Therapy", nameEs: "Fisioterapia", synonymsEn: ["physiotherapist", "PT clinic"], synonymsEs: ["fisioterapeuta"], businessTypeId: "medical_clinic" },
  { id: "acupuncture", nameEn: "Acupuncture", nameEs: "Acupuntura", synonymsEn: ["acupuncturist"], synonymsEs: ["acupunturista"], businessTypeId: "medical_clinic" },
  { id: "nutritionist_dietitian", nameEn: "Nutritionist / Dietitian", nameEs: "Nutriólogo / Dietista", synonymsEn: ["nutrition coaching"], synonymsEs: ["asesoría nutricional"], businessTypeId: "medical_clinic" },
  { id: "weight_loss_clinic", nameEn: "Weight Loss Clinic", nameEs: "Clínica para bajar de peso", synonymsEn: ["medical weight loss"], synonymsEs: ["clínica de pérdida de peso"], businessTypeId: "medical_clinic" },
  { id: "iv_hydration_therapy", nameEn: "IV Hydration Therapy Clinic", nameEs: "Clínica de hidratación intravenosa", synonymsEn: ["IV drip clinic"], synonymsEs: ["clínica de suero intravenoso"], businessTypeId: "medical_clinic" },

  // ---- Recreation & entertainment ------------------------------------
  // No existing type's copy fits venue-style entertainment businesses
  // (see the gap report's "Recreation & Entertainment" cluster).
  { id: "golf_driving_range", nameEn: "Golf Driving Range", nameEs: "Campo de práctica de golf", synonymsEn: ["golf range", "driving range"], synonymsEs: ["cancha de golf"], businessTypeId: "recreation" },
  { id: "mini_golf", nameEn: "Mini Golf", nameEs: "Minigolf", synonymsEn: ["putt putt", "miniature golf"], synonymsEs: ["golf miniatura"], businessTypeId: "recreation" },
  { id: "bowling_alley", nameEn: "Bowling Alley", nameEs: "Boliche", synonymsEn: ["bowling center"], synonymsEs: ["salón de boliche"], businessTypeId: "recreation" },
  { id: "escape_room", nameEn: "Escape Room", nameEs: "Cuarto de escape", synonymsEn: ["escape game"], synonymsEs: ["escape room"], businessTypeId: "recreation" },
  { id: "arcade", nameEn: "Arcade", nameEs: "Sala de videojuegos", synonymsEn: ["game arcade", "amusement arcade"], synonymsEs: ["arcade"], businessTypeId: "recreation" },
  { id: "trampoline_park", nameEn: "Trampoline Park", nameEs: "Parque de trampolines", synonymsEn: ["jump park"], synonymsEs: ["parque de brincolines"], businessTypeId: "recreation" },
  { id: "skating_rink", nameEn: "Skating Rink", nameEs: "Pista de patinaje", synonymsEn: ["ice rink", "roller rink"], synonymsEs: ["pista de hielo", "pista de patinaje sobre ruedas"], businessTypeId: "recreation" },
  { id: "paintball", nameEn: "Paintball Arena", nameEs: "Cancha de paintball", synonymsEn: ["paintball field"], synonymsEs: ["campo de paintball"], businessTypeId: "recreation" },
  { id: "laser_tag", nameEn: "Laser Tag Arena", nameEs: "Arena de láser tag", synonymsEn: ["laser tag center"], synonymsEs: ["centro de láser tag"], businessTypeId: "recreation" },
  { id: "go_kart_track", nameEn: "Go-Kart Track", nameEs: "Pista de karts", synonymsEn: ["go karting"], synonymsEs: ["karts"], businessTypeId: "recreation" },
  { id: "batting_cages", nameEn: "Batting Cages", nameEs: "Jaulas de bateo", synonymsEn: ["batting cage facility"], synonymsEs: ["campo de bateo"], businessTypeId: "recreation" },
  { id: "axe_throwing", nameEn: "Axe Throwing Venue", nameEs: "Lanzamiento de hachas", synonymsEn: ["axe throwing bar"], synonymsEs: ["sala de lanzamiento de hachas"], businessTypeId: "recreation" },
  { id: "indoor_playground", nameEn: "Indoor Playground / Kids Play Center", nameEs: "Parque de juegos techado para niños", synonymsEn: ["indoor play center"], synonymsEs: ["centro de juegos infantiles"], businessTypeId: "recreation" },
  { id: "laser_maze", nameEn: "Laser Maze", nameEs: "Laberinto láser", synonymsEn: ["laser maze attraction"], synonymsEs: ["atracción de láser"], businessTypeId: "recreation" },
  { id: "vr_arcade", nameEn: "Virtual Reality Arcade", nameEs: "Arcade de realidad virtual", synonymsEn: ["VR gaming center"], synonymsEs: ["centro de realidad virtual"], businessTypeId: "recreation" },
  { id: "billiards_lounge", nameEn: "Pool Hall / Billiards Lounge", nameEs: "Salón de billar", synonymsEn: ["billiards hall"], synonymsEs: ["sala de billar"], businessTypeId: "recreation" },
  { id: "comedy_club", nameEn: "Comedy Club", nameEs: "Club de comedia", synonymsEn: ["stand-up comedy venue"], synonymsEs: ["club de stand up"], businessTypeId: "recreation" },
  { id: "indoor_skydiving", nameEn: "Indoor Skydiving", nameEs: "Paracaidismo bajo techo", synonymsEn: ["wind tunnel skydiving"], synonymsEs: ["túnel de viento"], businessTypeId: "recreation" },
  { id: "zipline_adventure_park", nameEn: "Zipline / Adventure Park", nameEs: "Parque de tirolesa", synonymsEn: ["ropes course", "canopy tour"], synonymsEs: ["parque de aventura"], businessTypeId: "recreation" },
  { id: "karaoke_room_rental", nameEn: "Private Karaoke Room Rental", nameEs: "Renta de salas de karaoke privadas", synonymsEn: ["karaoke box"], synonymsEs: ["cuarto de karaoke"], businessTypeId: "recreation" },
  { id: "adult_rec_sports_league", nameEn: "Adult Recreational Sports League", nameEs: "Liga deportiva recreativa para adultos", synonymsEn: ["rec sports league"], synonymsEs: ["liga deportiva recreativa"], businessTypeId: "recreation" },
  { id: "pickleball_club", nameEn: "Pickleball Club", nameEs: "Club de pickleball", synonymsEn: ["pickleball courts"], synonymsEs: ["canchas de pickleball"], businessTypeId: "recreation" },
  { id: "disc_golf_course", nameEn: "Disc Golf Course", nameEs: "Campo de disc golf", synonymsEn: ["frisbee golf"], synonymsEs: ["golf de disco"], businessTypeId: "recreation" },
  { id: "shooting_range", nameEn: "Shooting Range", nameEs: "Campo de tiro", synonymsEn: ["gun range"], synonymsEs: ["polígono de tiro"], businessTypeId: "recreation" },
  { id: "archery_range", nameEn: "Archery Range", nameEs: "Campo de tiro con arco", synonymsEn: ["archery lessons"], synonymsEs: ["clases de tiro con arco"], businessTypeId: "recreation" },
  { id: "kids_party_venue", nameEn: "Kids' Birthday Party Venue", nameEs: "Salón de fiestas infantiles", synonymsEn: ["kids party place"], synonymsEs: ["salón de fiestas para niños"], businessTypeId: "recreation" },
  { id: "bounce_house_rental", nameEn: "Bounce House / Inflatable Rental", nameEs: "Renta de brincolines", synonymsEn: ["inflatable rental"], synonymsEs: ["renta de inflables"], businessTypeId: "events" },

  // ---- Events & celebrations ------------------------------------------
  { id: "wedding_planner", nameEn: "Wedding Planner", nameEs: "Organizador de bodas", synonymsEn: ["wedding coordinator", "day-of coordinator"], synonymsEs: ["organizador de bodas"], businessTypeId: "events" },
  { id: "dj_service", nameEn: "DJ Service", nameEs: "Servicio de DJ", synonymsEn: ["wedding DJ", "party DJ"], synonymsEs: ["DJ para bodas", "DJ para fiestas"], businessTypeId: "events" },
  { id: "caterer", nameEn: "Caterer", nameEs: "Servicio de banquetes", synonymsEn: ["catering company", "catering service"], synonymsEs: ["empresa de banquetes", "catering"], businessTypeId: "events" },
  { id: "party_rental", nameEn: "Party Rental (Tents, Tables & Chairs)", nameEs: "Renta de mobiliario para fiestas", synonymsEn: ["tent rental", "chair and table rental"], synonymsEs: ["renta de carpas", "renta de sillas y mesas"], businessTypeId: "events" },
  { id: "photo_booth_rental", nameEn: "Photo Booth Rental", nameEs: "Renta de cabina de fotos", synonymsEn: ["photo booth company"], synonymsEs: ["renta de photo booth"], businessTypeId: "events" },
  { id: "event_venue", nameEn: "Event Venue / Banquet Hall", nameEs: "Salón de eventos", synonymsEn: ["banquet hall", "wedding venue"], synonymsEs: ["salón de banquetes"], businessTypeId: "events" },
  { id: "corporate_event_planner", nameEn: "Corporate Event Planner", nameEs: "Organizador de eventos corporativos", synonymsEn: ["event planner"], synonymsEs: ["planificador de eventos"], businessTypeId: "events" },
  { id: "officiant", nameEn: "Wedding Officiant", nameEs: "Oficiante de bodas", synonymsEn: ["marriage officiant"], synonymsEs: ["celebrante de bodas"], businessTypeId: "events" },
  { id: "invitation_design", nameEn: "Invitation & Stationery Design", nameEs: "Diseño de invitaciones", synonymsEn: ["custom invitations"], synonymsEs: ["invitaciones personalizadas"], businessTypeId: "events" },
  { id: "face_painting", nameEn: "Face Painting", nameEs: "Pintacaritas", synonymsEn: ["face painter", "balloon twisting"], synonymsEs: ["pintura facial"], businessTypeId: "events" },
  { id: "balloon_decor", nameEn: "Balloon Decor / Balloon Artist", nameEs: "Decoración con globos", synonymsEn: ["balloon garland", "balloon arch"], synonymsEs: ["arco de globos", "decorador de globos"], businessTypeId: "events" },
  { id: "fireworks_display", nameEn: "Fireworks Display Service", nameEs: "Servicio de fuegos artificiales", synonymsEn: ["fireworks company"], synonymsEs: ["empresa de pirotecnia"], businessTypeId: "events" },
  { id: "mobile_bartending", nameEn: "Mobile Bartending Service", nameEs: "Servicio de bartender a domicilio", synonymsEn: ["bartender for hire", "mobile bar"], synonymsEs: ["bartender para eventos"], businessTypeId: "events" },
  { id: "dessert_table_stylist", nameEn: "Dessert / Candy Table Stylist", nameEs: "Estilista de mesa de postres", synonymsEn: ["candy buffet"], synonymsEs: ["mesa de dulces"], businessTypeId: "events" },
  { id: "event_lighting_av", nameEn: "Event Lighting & AV Production", nameEs: "Iluminación y producción audiovisual para eventos", synonymsEn: ["event AV company"], synonymsEs: ["producción audiovisual de eventos"], businessTypeId: "events" },
  { id: "quinceanera_planner", nameEn: "Quinceañera Planner", nameEs: "Organizador de quinceañeras", synonymsEn: ["quinceañera coordinator"], synonymsEs: ["planificador de quince años"], businessTypeId: "events" },
  { id: "bar_bat_mitzvah_planner", nameEn: "Bar/Bat Mitzvah Planner", nameEs: "Organizador de bar/Bat mitzvah", synonymsEn: ["mitzvah coordinator"], synonymsEs: ["coordinador de bar mitzvah"], businessTypeId: "events" },
  { id: "videographer", nameEn: "Videographer", nameEs: "Videógrafo", synonymsEn: ["wedding videographer", "video production"], synonymsEs: ["video de bodas", "producción de video"], businessTypeId: "photographer" },
  { id: "photographer_trade", nameEn: "Photographer", nameEs: "Fotógrafo", synonymsEn: ["wedding photographer", "portrait photography"], synonymsEs: ["fotógrafo de bodas", "fotografía de retrato"], businessTypeId: "photographer" },
  { id: "bridal_shop", nameEn: "Bridal Shop", nameEs: "Tienda de novias", synonymsEn: ["wedding dress shop"], synonymsEs: ["tienda de vestidos de novia"], businessTypeId: "retail_boutique" },
  { id: "tuxedo_rental", nameEn: "Tuxedo Rental", nameEs: "Renta de esmoquin", synonymsEn: ["suit rental"], synonymsEs: ["renta de trajes"], businessTypeId: "retail_boutique" },
  { id: "wedding_favors_gifts", nameEn: "Wedding Favors & Gifts Shop", nameEs: "Tienda de recuerdos de boda", synonymsEn: ["party favors shop"], synonymsEs: ["recuerdos para fiestas"], businessTypeId: "retail_boutique" },
  { id: "custom_cake_designer", nameEn: "Custom Cake Designer", nameEs: "Diseñador de pasteles personalizados", synonymsEn: ["wedding cake baker", "cake artist"], synonymsEs: ["pastelero de bodas"], businessTypeId: "bakery" },

  // ---- Beauty & personal care ------------------------------------------
  { id: "tattoo_studio", nameEn: "Tattoo Studio", nameEs: "Estudio de tatuajes", synonymsEn: ["tattoo parlor", "tattoo artist"], synonymsEs: ["tatuador", "salón de tatuajes"], businessTypeId: "tattoo_body_art" },
  { id: "piercing_studio", nameEn: "Piercing Studio", nameEs: "Estudio de perforaciones", synonymsEn: ["body piercing"], synonymsEs: ["perforaciones corporales"], businessTypeId: "tattoo_body_art" },
  { id: "permanent_makeup", nameEn: "Permanent Makeup / Microblading", nameEs: "Maquillaje permanente / Microblading", synonymsEn: ["microblading studio"], synonymsEs: ["estudio de microblading"], businessTypeId: "tattoo_body_art" },
  { id: "tattoo_removal", nameEn: "Tattoo Removal", nameEs: "Remoción de tatuajes", synonymsEn: ["laser tattoo removal"], synonymsEs: ["remoción de tatuajes con láser"], businessTypeId: "tattoo_body_art" },
  { id: "scalp_micropigmentation", nameEn: "Scalp Micropigmentation", nameEs: "Micropigmentación capilar", synonymsEn: ["hairline tattoo"], synonymsEs: ["tatuaje capilar"], businessTypeId: "tattoo_body_art" },
  { id: "teeth_whitening_studio", nameEn: "Teeth Whitening Studio", nameEs: "Estudio de blanqueamiento dental", synonymsEn: ["teeth whitening kiosk"], synonymsEs: ["blanqueamiento dental"], businessTypeId: "spa" },
  { id: "lash_extensions", nameEn: "Lash Extensions", nameEs: "Extensiones de pestañas", synonymsEn: ["eyelash extensions", "lash lift"], synonymsEs: ["pestañas postizas"], businessTypeId: "spa" },
  { id: "brow_threading", nameEn: "Eyebrow Threading & Shaping", nameEs: "Diseño de cejas con hilo", synonymsEn: ["brow bar", "eyebrow shaping"], synonymsEs: ["barra de cejas"], businessTypeId: "spa" },
  { id: "waxing_studio", nameEn: "Waxing Studio", nameEs: "Estudio de depilación con cera", synonymsEn: ["hair removal waxing"], synonymsEs: ["depilación con cera"], businessTypeId: "spa" },
  { id: "med_spa", nameEn: "Med Spa", nameEs: "Spa médico", synonymsEn: ["medical spa", "botox clinic"], synonymsEs: ["clínica de botox"], businessTypeId: "spa" },
  { id: "skin_care_facial_spa", nameEn: "Skin Care / Facial Spa", nameEs: "Spa facial", synonymsEn: ["esthetician", "facial studio"], synonymsEs: ["esteticista", "estudio de faciales"], businessTypeId: "spa" },
  { id: "laser_hair_removal", nameEn: "Laser Hair Removal Clinic", nameEs: "Clínica de depilación láser", synonymsEn: ["laser hair removal studio"], synonymsEs: ["depilación láser"], businessTypeId: "spa" },
  { id: "tanning_salon", nameEn: "Tanning Salon", nameEs: "Salón de bronceado", synonymsEn: ["tanning bed studio"], synonymsEs: ["cama de bronceado"], businessTypeId: "spa" },
  { id: "hair_braiding", nameEn: "Hair Braiding", nameEs: "Trenzado de cabello", synonymsEn: ["braiding salon"], synonymsEs: ["salón de trenzas"], businessTypeId: "salon" },
  { id: "blowout_bar", nameEn: "Blowout Bar", nameEs: "Bar de peinados", synonymsEn: ["blow dry bar"], synonymsEs: ["salón de secado"], businessTypeId: "salon" },
  { id: "makeup_artist", nameEn: "Makeup Artist", nameEs: "Maquillista", synonymsEn: ["makeup studio", "bridal makeup"], synonymsEs: ["maquillaje profesional"], businessTypeId: "spa" },
  { id: "spray_tan_studio", nameEn: "Spray Tan Studio", nameEs: "Estudio de bronceado en aerosol", synonymsEn: ["airbrush tanning"], synonymsEs: ["bronceado en spray"], businessTypeId: "spa" },
  { id: "wig_shop", nameEn: "Wig Shop / Hair Replacement", nameEs: "Tienda de pelucas", synonymsEn: ["wig store", "hair replacement studio"], synonymsEs: ["tienda de pelucas y extensiones"], businessTypeId: "retail_boutique" },
  { id: "trophy_engraving_shop", nameEn: "Trophy & Engraving Shop", nameEs: "Tienda de trofeos y grabados", synonymsEn: ["awards and engraving"], synonymsEs: ["grabados y trofeos"], businessTypeId: "retail_boutique" },
  { id: "cosmetology_school", nameEn: "Cosmetology School", nameEs: "Escuela de cosmetología", synonymsEn: ["beauty school", "barber college"], synonymsEs: ["escuela de belleza"], businessTypeId: "tutor_education" },
  { id: "barbershop_trade", nameEn: "Barbershop", nameEs: "Barbería", synonymsEn: ["barber", "men's haircuts"], synonymsEs: ["barbero", "corte de cabello para hombres"], businessTypeId: "barbershop" },
  { id: "nail_salon_trade", nameEn: "Nail Salon", nameEs: "Salón de uñas", synonymsEn: ["manicure and pedicure", "nail spa"], synonymsEs: ["manicure y pedicure"], businessTypeId: "nail_salon" },
  { id: "hair_salon_trade", nameEn: "Hair Salon", nameEs: "Peluquería", synonymsEn: ["hairdresser", "hair stylist"], synonymsEs: ["estilista", "peluquero"], businessTypeId: "salon" },
  { id: "spa_trade", nameEn: "Spa", nameEs: "Spa", synonymsEn: ["day spa"], synonymsEs: ["spa de día"], businessTypeId: "spa" },

  // ---- Auto -------------------------------------------------------------
  { id: "auto_repair_shop", nameEn: "Auto Repair Shop", nameEs: "Taller mecánico", synonymsEn: ["mechanic", "car repair shop"], synonymsEs: ["mecánico", "taller de autos"], businessTypeId: "auto_repair" },
  { id: "tire_shop", nameEn: "Tire Shop", nameEs: "Llantera", synonymsEn: ["tire store", "tire installation"], synonymsEs: ["venta de llantas"], businessTypeId: "auto_repair" },
  { id: "auto_body_shop", nameEn: "Auto Body Shop", nameEs: "Taller de hojalatería y pintura", synonymsEn: ["collision repair", "auto body repair"], synonymsEs: ["reparación de colisiones"], businessTypeId: "auto_repair" },
  { id: "oil_change_shop", nameEn: "Oil Change Shop", nameEs: "Cambio de aceite", synonymsEn: ["quick lube"], synonymsEs: ["lubricentro"], businessTypeId: "auto_repair" },
  { id: "transmission_repair", nameEn: "Transmission Repair", nameEs: "Reparación de transmisiones", synonymsEn: ["transmission shop"], synonymsEs: ["taller de transmisiones"], businessTypeId: "auto_repair" },
  { id: "muffler_exhaust_shop", nameEn: "Muffler & Exhaust Shop", nameEs: "Taller de mofles", synonymsEn: ["exhaust repair"], synonymsEs: ["reparación de escapes"], businessTypeId: "auto_repair" },
  { id: "windshield_glass_repair", nameEn: "Auto Glass / Windshield Repair", nameEs: "Reparación de parabrisas", synonymsEn: ["windshield replacement"], synonymsEs: ["reemplazo de parabrisas"], businessTypeId: "auto_repair" },
  { id: "motorcycle_repair", nameEn: "Motorcycle Repair", nameEs: "Reparación de motocicletas", synonymsEn: ["motorcycle shop"], synonymsEs: ["taller de motocicletas"], businessTypeId: "auto_repair" },
  { id: "rv_repair", nameEn: "RV Repair", nameEs: "Reparación de casas rodantes", synonymsEn: ["motorhome repair"], synonymsEs: ["reparación de RV"], businessTypeId: "auto_repair" },
  { id: "mobile_mechanic", nameEn: "Mobile Mechanic", nameEs: "Mecánico a domicilio", synonymsEn: ["mobile auto repair"], synonymsEs: ["mecánico móvil"], businessTypeId: "auto_repair" },
  { id: "fleet_maintenance", nameEn: "Fleet Maintenance Service", nameEs: "Mantenimiento de flotillas", synonymsEn: ["commercial fleet repair"], synonymsEs: ["mantenimiento de flotas"], businessTypeId: "auto_repair" },
  { id: "vehicle_inspection_station", nameEn: "Vehicle Inspection Station", nameEs: "Estación de verificación vehicular", synonymsEn: ["emissions testing", "state inspection"], synonymsEs: ["verificación de emisiones"], businessTypeId: "auto_repair" },
  { id: "golf_cart_repair", nameEn: "Golf Cart Sales & Repair", nameEs: "Venta y reparación de carritos de golf", synonymsEn: ["golf cart shop"], synonymsEs: ["taller de carritos de golf"], businessTypeId: "auto_repair" },
  { id: "boat_marine_repair", nameEn: "Boat & Marine Repair", nameEs: "Reparación de embarcaciones", synonymsEn: ["marine mechanic"], synonymsEs: ["mecánico marino"], businessTypeId: "auto_repair" },
  { id: "atv_utv_repair", nameEn: "ATV / UTV Repair", nameEs: "Reparación de cuatrimotos", synonymsEn: ["off-road vehicle repair"], synonymsEs: ["reparación de todoterrenos"], businessTypeId: "auto_repair" },
  { id: "driving_school", nameEn: "Driving School", nameEs: "Escuela de manejo", synonymsEn: ["driving lessons"], synonymsEs: ["clases de manejo"], businessTypeId: "tutor_education" },
  { id: "car_wash", nameEn: "Car Wash", nameEs: "Lavado de autos", synonymsEn: ["car wash service"], synonymsEs: ["autolavado"], businessTypeId: "car_wash_detailing" },
  { id: "auto_detailing", nameEn: "Auto Detailing", nameEs: "Detallado de autos", synonymsEn: ["car detailing service"], synonymsEs: ["detallado automotriz"], businessTypeId: "car_wash_detailing" },
  { id: "towing_service", nameEn: "Towing Service", nameEs: "Servicio de grúa", synonymsEn: ["tow truck company", "roadside assistance"], synonymsEs: ["grúas", "asistencia vial"], businessTypeId: "auto_repair" },
  { id: "auto_salvage_junkyard", nameEn: "Auto Salvage / Junkyard", nameEs: "Deshuesadero", synonymsEn: ["junk car buyer"], synonymsEs: ["yonke", "compra de autos chatarra"], businessTypeId: "default" },
  { id: "window_tinting", nameEn: "Window Tinting", nameEs: "Polarizado de vidrios", synonymsEn: ["auto window tint shop"], synonymsEs: ["taller de polarizado"], businessTypeId: "car_wash_detailing" },
  { id: "car_audio_installation", nameEn: "Car Audio & Stereo Installation", nameEs: "Instalación de audio para autos", synonymsEn: ["car stereo shop"], synonymsEs: ["taller de audio automotriz"], businessTypeId: "car_wash_detailing" },
  { id: "used_car_dealership", nameEn: "Used Car Dealership", nameEs: "Venta de autos usados", synonymsEn: ["car dealer"], synonymsEs: ["lote de autos usados"], businessTypeId: "default" },
  { id: "car_wrap_graphics", nameEn: "Car Wrap & Vinyl Graphics", nameEs: "Rotulación de vehículos", synonymsEn: ["vehicle wrap shop"], synonymsEs: ["forrado de vehículos"], businessTypeId: "car_wash_detailing" },
  { id: "limousine_service", nameEn: "Limousine / Car Service", nameEs: "Servicio de limusinas", synonymsEn: ["chauffeur service"], synonymsEs: ["servicio de chofer"], businessTypeId: "default" },
  { id: "car_seat_installation", nameEn: "Car Seat Installation & Safety Check", nameEs: "Instalación de asientos para bebé", synonymsEn: ["child car seat check"], synonymsEs: ["revisión de sillas para bebé"], businessTypeId: "default" },
  { id: "auto_upholstery", nameEn: "Auto Upholstery", nameEs: "Tapicería automotriz", synonymsEn: ["car seat upholstery"], synonymsEs: ["tapicería de autos"], businessTypeId: "auto_repair" },
  { id: "diesel_repair", nameEn: "Diesel Repair Shop", nameEs: "Taller de diésel", synonymsEn: ["diesel mechanic"], synonymsEs: ["mecánico de diésel"], businessTypeId: "auto_repair" },
  { id: "wheel_alignment", nameEn: "Wheel Alignment & Suspension Shop", nameEs: "Taller de alineación y suspensión", synonymsEn: ["alignment shop"], synonymsEs: ["alineación y balanceo"], businessTypeId: "auto_repair" },
  { id: "car_key_fob_programming", nameEn: "Car Key Fob Programming", nameEs: "Programación de llaves de auto", synonymsEn: ["transponder key programming"], synonymsEs: ["duplicado de llaves de auto"], businessTypeId: "auto_repair" },

  // ---- Kids & education --------------------------------------------------
  { id: "tutoring_center", nameEn: "Tutoring Center", nameEs: "Centro de tutorías", synonymsEn: ["tutor", "learning center"], synonymsEs: ["tutor", "centro de aprendizaje"], businessTypeId: "tutor_education" },
  { id: "music_lessons", nameEn: "Music Lessons", nameEs: "Clases de música", synonymsEn: ["piano lessons", "guitar lessons"], synonymsEs: ["clases de piano", "clases de guitarra"], businessTypeId: "tutor_education" },
  { id: "art_classes", nameEn: "Art Classes / Studio", nameEs: "Clases de arte", synonymsEn: ["painting classes", "art studio for kids"], synonymsEs: ["clases de pintura"], businessTypeId: "tutor_education" },
  { id: "swim_school", nameEn: "Swim School", nameEs: "Escuela de natación", synonymsEn: ["swimming lessons"], synonymsEs: ["clases de natación"], businessTypeId: "tutor_education" },
  { id: "test_prep_center", nameEn: "Test Prep Center", nameEs: "Centro de preparación para exámenes", synonymsEn: ["SAT prep", "test preparation"], synonymsEs: ["preparación para exámenes"], businessTypeId: "tutor_education" },
  { id: "language_school", nameEn: "Language Learning School", nameEs: "Escuela de idiomas", synonymsEn: ["ESL classes", "Spanish classes"], synonymsEs: ["clases de inglés", "clases de idiomas"], businessTypeId: "tutor_education" },
  { id: "coding_stem_classes", nameEn: "Coding & STEM Classes for Kids", nameEs: "Clases de programación para niños", synonymsEn: ["kids coding academy", "robotics classes"], synonymsEs: ["academia de programación"], businessTypeId: "tutor_education" },
  { id: "chess_academy", nameEn: "Chess Academy / Club", nameEs: "Academia de ajedrez", synonymsEn: ["chess lessons"], synonymsEs: ["clases de ajedrez"], businessTypeId: "tutor_education" },
  { id: "college_prep_counseling", nameEn: "College Prep Counseling", nameEs: "Asesoría para ingreso a universidad", synonymsEn: ["college admissions counseling"], synonymsEs: ["asesoría universitaria"], businessTypeId: "tutor_education" },
  { id: "robotics_club", nameEn: "Robotics Club for Kids", nameEs: "Club de robótica para niños", synonymsEn: ["robotics classes"], synonymsEs: ["clases de robótica"], businessTypeId: "tutor_education" },
  { id: "theater_acting_classes", nameEn: "Theater & Acting Classes for Kids", nameEs: "Clases de teatro para niños", synonymsEn: ["drama classes", "acting school"], synonymsEs: ["clases de actuación"], businessTypeId: "tutor_education" },
  { id: "daycare_childcare", nameEn: "Daycare / Childcare Center", nameEs: "Guardería", synonymsEn: ["child care center"], synonymsEs: ["estancia infantil"], businessTypeId: "childcare" },
  { id: "preschool", nameEn: "Preschool", nameEs: "Preescolar", synonymsEn: ["pre-kindergarten"], synonymsEs: ["prekínder"], businessTypeId: "childcare" },
  { id: "montessori_school", nameEn: "Montessori School", nameEs: "Escuela Montessori", synonymsEn: ["montessori preschool"], synonymsEs: ["preescolar Montessori"], businessTypeId: "childcare" },
  { id: "after_school_program", nameEn: "After-School Program", nameEs: "Programa extraescolar", synonymsEn: ["after school care"], synonymsEs: ["cuidado después de la escuela"], businessTypeId: "childcare" },
  { id: "nanny_agency", nameEn: "Nanny / Babysitting Agency", nameEs: "Agencia de niñeras", synonymsEn: ["babysitting service"], synonymsEs: ["servicio de niñeras"], businessTypeId: "childcare" },
  { id: "summer_camp", nameEn: "Summer Camp", nameEs: "Campamento de verano", synonymsEn: ["day camp"], synonymsEs: ["campamento de día"], businessTypeId: "childcare" },
  { id: "homeschool_coop", nameEn: "Homeschool Co-op", nameEs: "Cooperativa de educación en casa", synonymsEn: ["homeschool group"], synonymsEs: ["grupo de educación en casa"], businessTypeId: "childcare" },
  { id: "childrens_museum", nameEn: "Children's Museum / Discovery Center", nameEs: "Museo infantil", synonymsEn: ["discovery center for kids"], synonymsEs: ["centro de descubrimiento infantil"], businessTypeId: "recreation" },

  // ---- Food & drink -------------------------------------------------------
  { id: "restaurant_trade", nameEn: "Restaurant", nameEs: "Restaurante", synonymsEn: ["eatery", "grill"], synonymsEs: ["comida", "parrilla"], businessTypeId: "restaurant" },
  { id: "pizzeria", nameEn: "Pizzeria", nameEs: "Pizzería", synonymsEn: ["pizza shop", "pizza place"], synonymsEs: ["pizza"], businessTypeId: "restaurant" },
  { id: "taqueria", nameEn: "Taqueria", nameEs: "Taquería", synonymsEn: ["taco shop"], synonymsEs: ["tacos"], businessTypeId: "restaurant" },
  { id: "deli", nameEn: "Deli", nameEs: "Delicatessen", synonymsEn: ["delicatessen", "sandwich deli"], synonymsEs: ["deli"], businessTypeId: "restaurant" },
  { id: "diner", nameEn: "Diner", nameEs: "Restaurante tipo diner", synonymsEn: ["breakfast diner"], synonymsEs: ["cafetería estilo diner"], businessTypeId: "restaurant" },
  { id: "bbq_restaurant", nameEn: "BBQ Restaurant", nameEs: "Restaurante de barbacoa", synonymsEn: ["barbecue joint", "smokehouse"], synonymsEs: ["barbacoa"], businessTypeId: "restaurant" },
  { id: "sushi_restaurant", nameEn: "Sushi Restaurant", nameEs: "Restaurante de sushi", synonymsEn: ["sushi bar"], synonymsEs: ["sushi"], businessTypeId: "restaurant" },
  { id: "burger_joint", nameEn: "Burger Joint", nameEs: "Hamburguesería", synonymsEn: ["burger restaurant"], synonymsEs: ["hamburguesas"], businessTypeId: "restaurant" },
  { id: "hot_dog_stand", nameEn: "Hot Dog Stand", nameEs: "Puesto de hot dogs", synonymsEn: ["hot dog cart"], synonymsEs: ["carrito de hot dogs"], businessTypeId: "restaurant" },
  { id: "steakhouse", nameEn: "Steakhouse", nameEs: "Restaurante de carnes", synonymsEn: ["steak restaurant"], synonymsEs: ["asador", "parrillada"], businessTypeId: "restaurant" },
  { id: "seafood_restaurant", nameEn: "Seafood Restaurant", nameEs: "Restaurante de mariscos", synonymsEn: ["seafood shack"], synonymsEs: ["mariscos"], businessTypeId: "restaurant" },
  { id: "vegan_restaurant", nameEn: "Vegan / Vegetarian Restaurant", nameEs: "Restaurante vegano", synonymsEn: ["plant-based restaurant"], synonymsEs: ["restaurante vegetariano"], businessTypeId: "restaurant" },
  { id: "brunch_spot", nameEn: "Breakfast & Brunch Spot", nameEs: "Restaurante de desayunos", synonymsEn: ["breakfast restaurant"], synonymsEs: ["desayunos y brunch"], businessTypeId: "restaurant" },
  { id: "sandwich_shop", nameEn: "Sandwich Shop", nameEs: "Sandwichería", synonymsEn: ["sub shop"], synonymsEs: ["tienda de sándwiches"], businessTypeId: "restaurant" },
  { id: "ramen_shop", nameEn: "Ramen / Noodle Shop", nameEs: "Restaurante de ramen", synonymsEn: ["noodle house"], synonymsEs: ["fideos", "ramen"], businessTypeId: "restaurant" },
  { id: "poke_bowl_shop", nameEn: "Poke Bowl Shop", nameEs: "Restaurante de poke", synonymsEn: ["poke restaurant"], synonymsEs: ["poke bowl"], businessTypeId: "restaurant" },
  { id: "fast_casual_salad_bar", nameEn: "Fast-Casual Salad Bar", nameEs: "Restaurante de ensaladas", synonymsEn: ["salad restaurant"], synonymsEs: ["barra de ensaladas"], businessTypeId: "restaurant" },
  { id: "wing_restaurant", nameEn: "Chicken Wing Restaurant", nameEs: "Restaurante de alitas", synonymsEn: ["wings joint"], synonymsEs: ["alitas de pollo"], businessTypeId: "restaurant" },
  { id: "brewery", nameEn: "Brewery", nameEs: "Cervecería", synonymsEn: ["craft brewery", "brewpub"], synonymsEs: ["cervecería artesanal"], businessTypeId: "bar" },
  { id: "bar_pub_tavern", nameEn: "Bar / Pub / Tavern", nameEs: "Bar / Cantina", synonymsEn: ["pub", "tavern", "taproom"], synonymsEs: ["cantina", "pub"], businessTypeId: "bar" },
  { id: "nightclub", nameEn: "Nightclub", nameEs: "Club nocturno", synonymsEn: ["dance club"], synonymsEs: ["discoteca"], businessTypeId: "bar" },
  { id: "cidery_taproom", nameEn: "Cidery / Hard Cider Taproom", nameEs: "Sidrería", synonymsEn: ["hard cider bar"], synonymsEs: ["bar de sidra"], businessTypeId: "bar" },
  { id: "karaoke_bar", nameEn: "Karaoke Bar", nameEs: "Bar de karaoke", synonymsEn: ["karaoke lounge"], synonymsEs: ["bar de karaoke"], businessTypeId: "bar" },
  { id: "cafe_trade", nameEn: "Cafe / Coffee Shop", nameEs: "Cafetería", synonymsEn: ["coffee shop", "espresso bar"], synonymsEs: ["café", "cafetería de especialidad"], businessTypeId: "cafe" },
  { id: "juice_bar", nameEn: "Juice Bar", nameEs: "Juguería", synonymsEn: ["fresh juice shop"], synonymsEs: ["jugos naturales"], businessTypeId: "cafe" },
  { id: "smoothie_bar", nameEn: "Smoothie Bar", nameEs: "Bar de batidos", synonymsEn: ["smoothie shop"], synonymsEs: ["batidos"], businessTypeId: "cafe" },
  { id: "ice_cream_shop", nameEn: "Ice Cream Shop", nameEs: "Heladería", synonymsEn: ["ice cream parlor", "gelato shop"], synonymsEs: ["helados", "gelatería"], businessTypeId: "cafe" },
  { id: "frozen_yogurt_shop", nameEn: "Frozen Yogurt Shop", nameEs: "Yogurtería", synonymsEn: ["froyo shop"], synonymsEs: ["yogurt helado"], businessTypeId: "cafe" },
  { id: "bubble_tea_shop", nameEn: "Bubble Tea / Boba Shop", nameEs: "Tienda de té de burbujas", synonymsEn: ["boba shop"], synonymsEs: ["boba", "té de burbujas"], businessTypeId: "cafe" },
  { id: "kombucha_taproom", nameEn: "Kombucha Taproom", nameEs: "Bar de kombucha", synonymsEn: ["kombucha bar"], synonymsEs: ["kombucha"], businessTypeId: "cafe" },
  { id: "tea_shop", nameEn: "Tea Shop", nameEs: "Casa de té", synonymsEn: ["tea house"], synonymsEs: ["té"], businessTypeId: "cafe" },
  { id: "board_game_cafe", nameEn: "Board Game Cafe", nameEs: "Café de juegos de mesa", synonymsEn: ["tabletop game cafe"], synonymsEs: ["café de mesa"], businessTypeId: "cafe" },
  { id: "bakery_trade", nameEn: "Bakery", nameEs: "Panadería", synonymsEn: ["patisserie", "bakeshop"], synonymsEs: ["repostería"], businessTypeId: "bakery" },
  { id: "donut_shop", nameEn: "Donut Shop", nameEs: "Tienda de donas", synonymsEn: ["doughnut shop"], synonymsEs: ["donas"], businessTypeId: "bakery" },
  { id: "bagel_shop", nameEn: "Bagel Shop", nameEs: "Tienda de bagels", synonymsEn: ["bagel bakery"], synonymsEs: ["bagels"], businessTypeId: "bakery" },
  { id: "winery", nameEn: "Winery", nameEs: "Viñedo / Bodega de vino", synonymsEn: ["wine tasting room"], synonymsEs: ["sala de cata de vino"], businessTypeId: "bar" },
  { id: "distillery", nameEn: "Distillery", nameEs: "Destilería", synonymsEn: ["distillery tasting room"], synonymsEs: ["sala de cata de licores"], businessTypeId: "bar" },
  { id: "meadery", nameEn: "Meadery", nameEs: "Hidromelería", synonymsEn: ["mead tasting room"], synonymsEs: ["sala de cata de hidromiel"], businessTypeId: "bar" },
  { id: "liquor_store_trade", nameEn: "Liquor Store", nameEs: "Licorería", synonymsEn: ["wine shop", "spirits store"], synonymsEs: ["tienda de licores"], businessTypeId: "liquor_store" },
  { id: "grocery_market_trade", nameEn: "Grocery Store", nameEs: "Tienda de abarrotes", synonymsEn: ["supermarket", "mini mart"], synonymsEs: ["supermercado", "minisúper"], businessTypeId: "grocery_market" },
  { id: "bodega", nameEn: "Bodega / Convenience Store", nameEs: "Bodega / Tienda de conveniencia", synonymsEn: ["corner store"], synonymsEs: ["tienda de la esquina"], businessTypeId: "grocery_market" },
  { id: "butcher_shop", nameEn: "Butcher Shop", nameEs: "Carnicería", synonymsEn: ["meat market"], synonymsEs: ["carnes"], businessTypeId: "grocery_market" },
  { id: "seafood_market", nameEn: "Seafood Market", nameEs: "Pescadería", synonymsEn: ["fish market"], synonymsEs: ["mariscos frescos"], businessTypeId: "grocery_market" },
  { id: "cheese_shop", nameEn: "Cheese Shop", nameEs: "Quesería", synonymsEn: ["specialty cheese store"], synonymsEs: ["tienda de quesos"], businessTypeId: "grocery_market" },
  { id: "spice_shop", nameEn: "Spice Shop", nameEs: "Tienda de especias", synonymsEn: ["specialty spice store"], synonymsEs: ["especias"], businessTypeId: "grocery_market" },
  { id: "candy_shop", nameEn: "Candy Shop", nameEs: "Dulcería", synonymsEn: ["chocolatier", "sweet shop"], synonymsEs: ["chocolatería", "dulces"], businessTypeId: "retail_boutique" },
  { id: "food_truck", nameEn: "Food Truck", nameEs: "Camión de comida", synonymsEn: ["food cart", "mobile food vendor"], synonymsEs: ["food truck", "carrito de comida"], businessTypeId: "restaurant" },
  { id: "food_hall_market", nameEn: "Food Hall / Market Stalls", nameEs: "Mercado gastronómico", synonymsEn: ["food market stalls"], synonymsEs: ["mercado de comida"], businessTypeId: "restaurant" },
  { id: "meal_prep_delivery", nameEn: "Meal Prep & Delivery Service", nameEs: "Servicio de comidas preparadas a domicilio", synonymsEn: ["meal prep company"], synonymsEs: ["comidas preparadas"], businessTypeId: "restaurant" },
  { id: "smoke_shop", nameEn: "Smoke Shop / Vape Shop", nameEs: "Tienda de cigarros electrónicos", synonymsEn: ["vape shop", "tobacco shop"], synonymsEs: ["vapeadores", "tabaquería"], businessTypeId: "default" },
  { id: "cigar_lounge", nameEn: "Cigar Lounge", nameEs: "Salón de puros", synonymsEn: ["cigar shop"], synonymsEs: ["tienda de puros"], businessTypeId: "bar" },
  { id: "vending_machine_business", nameEn: "Vending Machine Business", nameEs: "Negocio de máquinas expendedoras", synonymsEn: ["vending machine route"], synonymsEs: ["máquinas expendedoras"], businessTypeId: "default" },
  { id: "ghost_kitchen", nameEn: "Ghost Kitchen / Virtual Restaurant", nameEs: "Cocina fantasma", synonymsEn: ["delivery-only kitchen"], synonymsEs: ["cocina solo para delivery"], businessTypeId: "restaurant" },

  // ---- Lodging & short-term rentals --------------------------------------
  { id: "hotel_motel", nameEn: "Hotel / Motel", nameEs: "Hotel / Motel", synonymsEn: ["inn", "extended stay lodging"], synonymsEs: ["posada"], businessTypeId: "lodging" },
  { id: "bed_and_breakfast", nameEn: "Bed & Breakfast", nameEs: "Posada / Bed & Breakfast", synonymsEn: ["B&B"], synonymsEs: ["hospedaje familiar"], businessTypeId: "lodging" },
  { id: "vacation_rental_management", nameEn: "Vacation Rental Management", nameEs: "Administración de rentas vacacionales", synonymsEn: ["short-term rental management", "Airbnb management"], synonymsEs: ["administración de Airbnb"], businessTypeId: "lodging" },
  { id: "hostel", nameEn: "Hostel", nameEs: "Hostal", synonymsEn: ["backpacker hostel"], synonymsEs: ["albergue"], businessTypeId: "lodging" },
  { id: "rv_campground", nameEn: "RV Park / Campground", nameEs: "Campamento para RV", synonymsEn: ["campground"], synonymsEs: ["campamento"], businessTypeId: "lodging" },
  { id: "glamping_site", nameEn: "Glamping Site", nameEs: "Sitio de glamping", synonymsEn: ["luxury camping"], synonymsEs: ["campamento de lujo"], businessTypeId: "lodging" },
  { id: "corporate_housing", nameEn: "Corporate Housing", nameEs: "Vivienda corporativa", synonymsEn: ["furnished corporate rentals"], synonymsEs: ["vivienda amueblada corporativa"], businessTypeId: "lodging" },
  { id: "timeshare_resort", nameEn: "Timeshare Resort", nameEs: "Resort de tiempo compartido", synonymsEn: ["timeshare property"], synonymsEs: ["tiempo compartido"], businessTypeId: "lodging" },

  // ---- Pet services (existing "pet_services" type genuinely fits all) ---
  { id: "pet_grooming", nameEn: "Pet Grooming", nameEs: "Estética canina", synonymsEn: ["dog grooming", "mobile pet grooming"], synonymsEs: ["peluquería canina"], businessTypeId: "pet_services" },
  { id: "veterinary_clinic", nameEn: "Veterinary Clinic", nameEs: "Clínica veterinaria", synonymsEn: ["vet clinic", "animal hospital"], synonymsEs: ["veterinario", "hospital de animales"], businessTypeId: "pet_services" },
  { id: "pet_boarding_kennel", nameEn: "Pet Boarding / Kennel", nameEs: "Pensión para mascotas", synonymsEn: ["dog boarding", "kennel"], synonymsEs: ["guardería de perros"], businessTypeId: "pet_services" },
  { id: "dog_walking", nameEn: "Dog Walking", nameEs: "Paseo de perros", synonymsEn: ["dog walker"], synonymsEs: ["paseador de perros"], businessTypeId: "pet_services" },
  { id: "pet_sitting", nameEn: "Pet Sitting", nameEs: "Cuidado de mascotas", synonymsEn: ["pet sitter"], synonymsEs: ["niñera de mascotas"], businessTypeId: "pet_services" },
  { id: "pet_store", nameEn: "Pet Store", nameEs: "Tienda de mascotas", synonymsEn: ["pet supply shop"], synonymsEs: ["tienda de animales"], businessTypeId: "pet_services" },
  { id: "dog_training", nameEn: "Dog Training", nameEs: "Adiestramiento canino", synonymsEn: ["dog trainer", "obedience training"], synonymsEs: ["entrenador de perros"], businessTypeId: "pet_services" },
  { id: "pet_daycare", nameEn: "Pet Daycare", nameEs: "Guardería para mascotas", synonymsEn: ["dog daycare"], synonymsEs: ["guardería canina"], businessTypeId: "pet_services" },
  { id: "horse_boarding_stable", nameEn: "Horse Boarding Stable", nameEs: "Establo de caballos", synonymsEn: ["equestrian stable"], synonymsEs: ["caballeriza"], businessTypeId: "pet_services" },
  { id: "pet_taxi", nameEn: "Pet Taxi / Transport", nameEs: "Transporte de mascotas", synonymsEn: ["pet transportation service"], synonymsEs: ["taxi para mascotas"], businessTypeId: "pet_services" },
  { id: "pet_photography", nameEn: "Pet Photography", nameEs: "Fotografía de mascotas", synonymsEn: ["pet portrait photographer"], synonymsEs: ["fotógrafo de mascotas"], businessTypeId: "photographer" },
  { id: "pet_waste_removal", nameEn: "Pet Waste Removal Service", nameEs: "Servicio de recolección de desechos de mascotas", synonymsEn: ["pooper scooper service"], synonymsEs: ["limpieza de desechos de mascotas"], businessTypeId: "pet_services" },

  // ---- Laundry, printing, moving & storage (small default clusters) ------
  { id: "laundromat", nameEn: "Laundromat", nameEs: "Lavandería", synonymsEn: ["coin laundry"], synonymsEs: ["lavandería de monedas"], businessTypeId: "repair_dropoff" },
  { id: "dry_cleaner", nameEn: "Dry Cleaner", nameEs: "Tintorería", synonymsEn: ["dry cleaning service"], synonymsEs: ["limpieza en seco"], businessTypeId: "repair_dropoff" },
  { id: "wash_and_fold", nameEn: "Wash-and-Fold Laundry Service", nameEs: "Servicio de lavado y doblado", synonymsEn: ["laundry pickup and delivery"], synonymsEs: ["lavado y entrega a domicilio"], businessTypeId: "repair_dropoff" },
  { id: "print_shop", nameEn: "Print Shop / Copy Center", nameEs: "Imprenta / Centro de copiado", synonymsEn: ["copy shop", "printing service"], synonymsEs: ["copias", "servicio de impresión"], businessTypeId: "default" },
  { id: "sign_maker", nameEn: "Sign Maker", nameEs: "Fabricante de letreros", synonymsEn: ["sign shop", "vinyl banner shop"], synonymsEs: ["taller de letreros"], businessTypeId: "default" },
  { id: "screen_printing_embroidery", nameEn: "Screen Printing & Embroidery", nameEs: "Serigrafía y bordado", synonymsEn: ["t-shirt printing", "custom embroidery"], synonymsEs: ["impresión de camisetas", "bordado personalizado"], businessTypeId: "default" },
  { id: "promotional_products", nameEn: "Promotional Products Company", nameEs: "Empresa de artículos promocionales", synonymsEn: ["branded merchandise supplier"], synonymsEs: ["artículos promocionales"], businessTypeId: "default" },
  { id: "movers", nameEn: "Movers / Moving Company", nameEs: "Compañía de mudanzas", synonymsEn: ["moving company", "long-distance movers"], synonymsEs: ["mudanzas"], businessTypeId: "home_services" },
  { id: "junk_removal", nameEn: "Junk Removal", nameEs: "Remoción de basura", synonymsEn: ["junk hauling service"], synonymsEs: ["recolección de basura"], businessTypeId: "home_services" },
  { id: "self_storage", nameEn: "Self Storage Facility", nameEs: "Bodega de autoalmacenaje", synonymsEn: ["storage unit rental"], synonymsEs: ["renta de bodegas"], businessTypeId: "default" },
  { id: "dumpster_rental", nameEn: "Dumpster Rental", nameEs: "Renta de contenedores de basura", synonymsEn: ["roll-off dumpster"], synonymsEs: ["renta de contenedores"], businessTypeId: "home_services" },
  { id: "packing_shipping_store", nameEn: "Packing & Shipping Store", nameEs: "Tienda de empaque y envíos", synonymsEn: ["pack and ship store", "mailbox rental"], synonymsEs: ["tienda de envíos"], businessTypeId: "default" },
  { id: "courier_delivery_service", nameEn: "Courier / Delivery Service", nameEs: "Servicio de mensajería", synonymsEn: ["local courier"], synonymsEs: ["mensajería local"], businessTypeId: "default" },
  { id: "document_shredding", nameEn: "Document Shredding Service", nameEs: "Servicio de trituración de documentos", synonymsEn: ["paper shredding company"], synonymsEs: ["trituración de papel"], businessTypeId: "default" },
  { id: "embroidery_monogramming", nameEn: "Embroidery & Monogramming Shop", nameEs: "Tienda de bordado y monogramas", synonymsEn: ["monogram shop"], synonymsEs: ["monogramas"], businessTypeId: "default" },

  // ---- Professional & retail services (existing types genuinely fit) ----
  { id: "lawyer_trade", nameEn: "Lawyer", nameEs: "Abogado", synonymsEn: ["attorney", "law firm"], synonymsEs: ["bufete de abogados"], businessTypeId: "lawyer" },
  { id: "accountant_trade", nameEn: "Accountant", nameEs: "Contador", synonymsEn: ["CPA", "tax preparation"], synonymsEs: ["contador público", "preparación de impuestos"], businessTypeId: "accountant" },
  { id: "bookkeeper", nameEn: "Bookkeeper", nameEs: "Auxiliar contable", synonymsEn: ["bookkeeping service"], synonymsEs: ["servicio de contabilidad"], businessTypeId: "accountant" },
  { id: "payroll_hr_services", nameEn: "Payroll & HR Services", nameEs: "Servicios de nómina y RH", synonymsEn: ["payroll processing"], synonymsEs: ["procesamiento de nómina"], businessTypeId: "accountant" },
  { id: "real_estate_agent", nameEn: "Real Estate Agent", nameEs: "Agente inmobiliario", synonymsEn: ["realtor", "real estate agency"], synonymsEs: ["realtor", "agencia inmobiliaria"], businessTypeId: "real_estate" },
  { id: "consultant_trade", nameEn: "Consultant", nameEs: "Consultor", synonymsEn: ["business consultant", "advisory services"], synonymsEs: ["asesoría empresarial"], businessTypeId: "consultant" },
  { id: "it_consultant", nameEn: "IT Consultant", nameEs: "Consultor de TI", synonymsEn: ["IT support business", "network consultant"], synonymsEs: ["soporte técnico empresarial"], businessTypeId: "consultant" },
  { id: "insurance_agent", nameEn: "Insurance Agent", nameEs: "Agente de seguros", synonymsEn: ["insurance agency"], synonymsEs: ["agencia de seguros"], businessTypeId: "consultant" },
  { id: "translation_service", nameEn: "Translation & Interpretation Service", nameEs: "Servicio de traducción e interpretación", synonymsEn: ["translator", "interpreter"], synonymsEs: ["traductor", "intérprete"], businessTypeId: "consultant" },
  { id: "web_graphic_design_agency", nameEn: "Web & Graphic Design Agency", nameEs: "Agencia de diseño web y gráfico", synonymsEn: ["web designer", "graphic designer"], synonymsEs: ["diseñador web", "diseñador gráfico"], businessTypeId: "consultant" },
  { id: "marketing_agency", nameEn: "Marketing & Advertising Agency", nameEs: "Agencia de marketing y publicidad", synonymsEn: ["digital marketing agency"], synonymsEs: ["agencia de marketing digital"], businessTypeId: "consultant" },
  { id: "virtual_assistant_service", nameEn: "Virtual Assistant Service", nameEs: "Servicio de asistente virtual", synonymsEn: ["VA agency"], synonymsEs: ["asistente virtual"], businessTypeId: "consultant" },
  { id: "financial_advisor", nameEn: "Financial Advisor", nameEs: "Asesor financiero", synonymsEn: ["wealth management"], synonymsEs: ["gestión patrimonial"], businessTypeId: "consultant" },
  { id: "interior_designer", nameEn: "Interior Designer", nameEs: "Diseñador de interiores", synonymsEn: ["interior design studio"], synonymsEs: ["decorador de interiores"], businessTypeId: "consultant" },
  { id: "architect", nameEn: "Architect", nameEs: "Arquitecto", synonymsEn: ["architecture firm"], synonymsEs: ["firma de arquitectura"], businessTypeId: "consultant" },
  { id: "staffing_agency", nameEn: "Staffing & Recruiting Agency", nameEs: "Agencia de reclutamiento", synonymsEn: ["recruiting firm", "temp agency"], synonymsEs: ["agencia de empleo"], businessTypeId: "consultant" },
  { id: "it_support_business", nameEn: "IT Support Business", nameEs: "Empresa de soporte de TI", synonymsEn: ["managed IT services", "network cabling installer"], synonymsEs: ["servicios de TI administrados"], businessTypeId: "consultant" },
  { id: "immigration_consultant", nameEn: "Immigration Consultant", nameEs: "Consultor de inmigración", synonymsEn: ["immigration services"], synonymsEs: ["servicios de inmigración"], businessTypeId: "consultant" },
  { id: "court_reporting_service", nameEn: "Court Reporting Service", nameEs: "Servicio de taquigrafía judicial", synonymsEn: ["deposition reporting"], synonymsEs: ["taquígrafo judicial"], businessTypeId: "consultant" },
  { id: "pr_firm", nameEn: "Public Relations Firm", nameEs: "Firma de relaciones públicas", synonymsEn: ["PR agency"], synonymsEs: ["agencia de relaciones públicas"], businessTypeId: "consultant" },
  { id: "app_software_dev_agency", nameEn: "App / Software Development Agency", nameEs: "Agencia de desarrollo de software", synonymsEn: ["software development shop"], synonymsEs: ["desarrollo de aplicaciones"], businessTypeId: "consultant" },
  { id: "appraiser", nameEn: "Appraiser (Real Estate / Antiques)", nameEs: "Tasador", synonymsEn: ["appraisal service"], synonymsEs: ["servicio de tasación"], businessTypeId: "consultant" },
  { id: "home_organizer", nameEn: "Professional Home Organizer", nameEs: "Organizador profesional del hogar", synonymsEn: ["closet organizer"], synonymsEs: ["organizador de closets"], businessTypeId: "consultant" },
  { id: "coach_trade", nameEn: "Coach", nameEs: "Coach", synonymsEn: ["coaching services"], synonymsEs: ["servicios de coaching"], businessTypeId: "coach" },
  { id: "resume_career_coaching", nameEn: "Resume Writing & Career Coaching", nameEs: "Redacción de CV y coaching de carrera", synonymsEn: ["career coach", "resume writer"], synonymsEs: ["coach de carrera"], businessTypeId: "coach" },
  { id: "photographer_generic_trade", nameEn: "Photography Studio", nameEs: "Estudio de fotografía", synonymsEn: ["portrait studio"], synonymsEs: ["estudio de retratos"], businessTypeId: "photographer" },
  { id: "dentist_trade", nameEn: "Dentist", nameEs: "Dentista", synonymsEn: ["dental office", "orthodontist"], synonymsEs: ["consultorio dental", "ortodoncista"], businessTypeId: "dentist" },
  { id: "medical_clinic_trade", nameEn: "Medical Clinic", nameEs: "Clínica médica", synonymsEn: ["doctor's office", "urgent care"], synonymsEs: ["consultorio médico", "clínica de urgencias"], businessTypeId: "medical_clinic" },
  { id: "optometrist", nameEn: "Optometrist", nameEs: "Optometrista", synonymsEn: ["eye doctor", "vision center"], synonymsEs: ["oculista", "centro de visión"], businessTypeId: "medical_clinic" },
  { id: "hardware_store_trade", nameEn: "Hardware Store", nameEs: "Ferretería", synonymsEn: ["hardware shop"], synonymsEs: ["tlapalería"], businessTypeId: "hardware_store" },
  { id: "florist_trade", nameEn: "Florist", nameEs: "Florería", synonymsEn: ["flower shop"], synonymsEs: ["floristería"], businessTypeId: "florist" },
  { id: "retail_boutique_trade", nameEn: "Clothing Boutique", nameEs: "Boutique de ropa", synonymsEn: ["clothing store", "apparel shop"], synonymsEs: ["tienda de ropa"], businessTypeId: "retail_boutique" },
  { id: "gift_shop", nameEn: "Gift Shop", nameEs: "Tienda de regalos", synonymsEn: ["gift boutique"], synonymsEs: ["regalos"], businessTypeId: "retail_boutique" },
  { id: "shoe_store", nameEn: "Shoe Store", nameEs: "Zapatería", synonymsEn: ["footwear store"], synonymsEs: ["tienda de calzado"], businessTypeId: "retail_boutique" },
  { id: "notary_public", nameEn: "Notary Public", nameEs: "Notario público", synonymsEn: ["mobile notary"], synonymsEs: ["notario móvil"], businessTypeId: "consultant" },
  { id: "travel_agency", nameEn: "Travel Agency", nameEs: "Agencia de viajes", synonymsEn: ["travel agent"], synonymsEs: ["agente de viajes"], businessTypeId: "consultant" },
  { id: "estate_sale_company", nameEn: "Estate Sale Company", nameEs: "Empresa de ventas de patrimonio", synonymsEn: ["estate liquidator"], synonymsEs: ["liquidación de patrimonio"], businessTypeId: "default" },
  { id: "private_investigator", nameEn: "Private Investigator", nameEs: "Investigador privado", synonymsEn: ["PI agency"], synonymsEs: ["agencia de investigación privada"], businessTypeId: "default" },
  { id: "security_guard_company", nameEn: "Security Guard Company", nameEs: "Empresa de guardias de seguridad", synonymsEn: ["security services company"], synonymsEs: ["servicios de seguridad"], businessTypeId: "default" },

  // ---- Plumbing & electrical (existing "plumber"/"electrician" types) ----
  { id: "plumber_trade", nameEn: "Plumber", nameEs: "Plomero", synonymsEn: ["plumbing company", "drain cleaning"], synonymsEs: ["fontanero", "empresa de plomería"], businessTypeId: "plumber" },
  { id: "electrician_trade", nameEn: "Electrician", nameEs: "Electricista", synonymsEn: ["electrical contractor", "electrical service"], synonymsEs: ["contratista eléctrico", "servicio eléctrico"], businessTypeId: "electrician" },
  { id: "cleaning_service_trade", nameEn: "House Cleaning Service", nameEs: "Servicio de limpieza del hogar", synonymsEn: ["maid service", "janitorial service"], synonymsEs: ["servicio de limpieza", "empleada doméstica"], businessTypeId: "cleaning_service" },
];

/** Strips accents/diacritics and lowercases, so "peluqueria" (typed
 * without an accent) matches "peluquería" and matching never depends on
 * capitalization. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export interface TradeSearchResult {
  id: string;
  label: string;
  businessTypeId: BusinessTypeId;
}

/**
 * Finds trades matching `query` — across BOTH English and Spanish names
 * and synonyms, regardless of `locale` (a Spanish speaker using an
 * English-language account can still type "zapatero" and find shoe
 * repair, and vice versa). `locale` only picks which of the matched
 * trade's own names is returned as `label`, so the UI can show it in
 * the business's current language. Names that START WITH the query
 * rank above ones that merely contain it; ties break on the shortest
 * matching text, then alphabetically. Returns at most 8 results; an
 * empty or non-matching query returns none (the caller's UI is
 * expected to offer "Something else" in that case).
 */
export function searchTrades(query: string, locale: Locale = DEFAULT_LOCALE): TradeSearchResult[] {
  const q = normalize(query);
  if (!q) return [];

  const scored: Array<{ entry: TradeEntry; rank: number; matchLength: number }> = [];

  for (const entry of TRADES) {
    const candidates = [entry.nameEn, entry.nameEs, ...entry.synonymsEn, ...entry.synonymsEs].map(normalize);
    let bestRank = Infinity;
    let bestLength = Infinity;
    for (const candidate of candidates) {
      if (!candidate.includes(q)) continue;
      const rank = candidate.startsWith(q) ? 0 : 1;
      if (rank < bestRank || (rank === bestRank && candidate.length < bestLength)) {
        bestRank = rank;
        bestLength = candidate.length;
      }
    }
    if (bestRank !== Infinity) {
      scored.push({ entry, rank: bestRank, matchLength: bestLength });
    }
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.matchLength !== b.matchLength) return a.matchLength - b.matchLength;
    return a.entry.nameEn.localeCompare(b.entry.nameEn);
  });

  return scored.slice(0, 8).map(({ entry }) => ({
    id: entry.id,
    label: locale === "es" ? entry.nameEs : entry.nameEn,
    businessTypeId: entry.businessTypeId,
  }));
}
