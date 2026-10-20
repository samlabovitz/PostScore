// Business niches (Day 5, docs + ~/Desktop/business-types-plan.md): the
// specific kind of business ("Skate & snow shop") under one of the 44
// parent business types in config/bizProfiles.ts ("specialty_store").
// A niche inherits everything from its parent — scoring, content, CTA
// wording — and adds its own label, how we recognize it, and what else it
// competes with ("also competes with" areas, each a real niche id).
//
// Every parent type is also a niche with the parent's own id (its
// "general" fallback, e.g. "specialty_store" = "Specialty store"), so a
// business we can't place more precisely still has a niche.
//
// Data only; detection is lib/niches.ts.

import type { BusinessTypeId } from "@/lib/tradeSearch";

export interface NicheDef {
  id: string;
  parent: BusinessTypeId;
  label: { en: string; es: string };
  /** Google Places types that mean this niche (primary is strongest). */
  googleTypes: string[];
  /** Whole-word keywords matched in the name, Google category and trade. */
  keywords: string[];
  /** "Also competes with" — real niche ids. */
  areas: string[];
}

type Row = [id: string, en: string, es: string, googleTypes: string[], keywords: string[], areas: string[]];

/** The parent general niches' areas (their label is the parent's own). */
const GENERAL_AREAS: Partial<Record<BusinessTypeId, string[]>> = {
  barbershop: ["hair_salon"],
  salon: ["barbershop", "nail_salon"],
  nail_salon: ["lash_brow", "spa"],
  spa: ["massage", "med_spa", "nail_salon"],
  dessert_shop: ["bakery", "ice_cream"],
  cafe: ["bakery", "bagel_shop", "tea_house"],
  bar: ["sports_bar", "restaurant"],
  bakery: ["cafe", "dessert_shop"],
  liquor_store: ["wine_shop", "beer_store", "grocery_market"],
  grocery_market: ["convenience_store", "international_market"],
  restaurant: [],
  hardware_store: ["home_improvement", "paint_store", "garden_center"],
  florist: ["garden_center", "gift_shop"],
  retail_boutique: ["department_store", "shoe_store"],
  specialty_store: ["gift_shop", "department_store"],
  community_center: ["ymca_jcc", "recreation_center"],
  gym_fitness: ["yoga", "crossfit"],
  pet_services: ["pet_grooming", "pet_store"],
  dentist: ["orthodontist", "pediatric_dentist"],
  medical_clinic: ["urgent_care"],
  lawyer: [],
  accountant: ["tax_prep", "bookkeeping"],
  real_estate: ["property_management"],
  consultant: ["coach", "marketing_agency"],
  coach: ["therapist", "consultant"],
  tutor_education: ["learning_center", "test_prep"],
  photographer: ["photo_studio"],
  practitioner: ["therapist", "coach"],
  auto_repair: ["tire_shop", "oil_change"],
  plumber: ["drain_sewer", "hvac"],
  electrician: ["hvac", "solar", "handyman"],
  landscaper: ["lawn_care", "tree_service"],
  cleaning_service: ["commercial_cleaning"],
  home_services: ["handyman", "general_contractor"],
  repair_dropoff: ["dry_cleaner", "tailor"],
  recreation: ["arcade", "bowling"],
  events: ["wedding_venue"],
  car_wash_detailing: ["detailing"],
  childcare: ["preschool", "after_school"],
  lodging: ["motel", "bed_breakfast"],
  tattoo_body_art: ["piercing"],
  nonprofit: [],
  place_of_worship: [],
  default: [],
};

const SPECIFIC: Partial<Record<BusinessTypeId, Row[]>> = {
  barbershop: [],
  salon: [
    ["hair_salon", "Hair salon", "Peluquería", ["hair_salon"], ["hair salon", "hairdresser", "hair studio"], ["barbershop", "blowout_bar"]],
    ["blowout_bar", "Blow-dry bar", "Bar de peinados", [], ["blowout", "blow dry", "blow-dry", "drybar"], ["hair_salon"]],
    ["braiding", "Hair braiding & natural hair", "Trenzas y cabello natural", [], ["braid", "braids", "braiding", "natural hair", "locs"], ["hair_salon"]],
    ["makeup_artist", "Makeup artist", "Maquillaje profesional", [], ["makeup artist", "makeup"], ["hair_salon", "lash_brow"]],
    ["tanning", "Tanning salon", "Salón de bronceado", ["tanning_studio"], ["tanning", "spray tan"], ["spa", "nail_salon"]],
  ],
  nail_salon: [
    ["lash_brow", "Lash & brow studio", "Estudio de pestañas y cejas", [], ["lash", "lashes", "brow", "brows", "threading"], ["nail_salon", "permanent_makeup", "makeup_artist"]],
    ["waxing", "Waxing studio", "Estudio de depilación", [], ["wax", "waxing"], ["lash_brow", "spa"]],
  ],
  spa: [
    ["massage", "Massage", "Masajes", ["massage", "massage_spa"], ["massage"], ["spa", "chiropractor", "physical_therapy"]],
    ["med_spa", "Med spa", "Spa médico", [], ["med spa", "medspa", "botox", "aesthetics", "medical spa"], ["dermatology", "spa"]],
    ["sauna_wellness", "Sauna & wellness", "Sauna y bienestar", ["sauna"], ["sauna", "float", "cryotherapy"], ["spa", "gym_fitness"]],
  ],
  dessert_shop: [
    ["ice_cream", "Ice cream & frozen yogurt shop", "Heladería", ["ice_cream_shop"], ["ice cream", "gelato", "froyo", "frozen yogurt", "helados", "heladería"], ["dessert_shop", "bakery", "cafe"]],
    ["donut_shop", "Donut shop", "Tienda de donas", ["donut_shop"], ["donut", "donuts", "doughnut", "doughnuts", "mochinut"], ["bakery", "cafe"]],
    ["candy_chocolate", "Candy & chocolate shop", "Dulcería y chocolatería", ["candy_store", "chocolate_shop", "confectionery"], ["candy", "chocolate", "chocolates", "sweets"], ["gift_shop", "bakery"]],
  ],
  cafe: [
    ["coffee_roaster", "Coffee roaster", "Tostador de café", ["coffee_roastery"], ["roaster", "roasters", "roastery"], ["cafe"]],
    ["tea_house", "Tea house", "Casa de té", ["tea_house"], ["tea house", "teahouse", "tea room"], ["cafe", "bubble_tea"]],
    ["bubble_tea", "Bubble tea", "Té de burbujas", [], ["boba", "bubble tea", "milk tea", "kung fu tea", "tastea"], ["tea_house", "dessert_shop"]],
    ["juice_bar", "Juice & smoothie bar", "Jugos y licuados", ["juice_shop"], ["juice", "smoothie", "smoothies", "acai"], ["cafe", "salad_bowls"]],
  ],
  bar: [
    ["sports_bar", "Sports bar", "Bar deportivo", [], ["sports bar"], ["bar", "chicken_wings"]],
    ["brewery", "Brewery & taproom", "Cervecería", ["brewery"], ["brewery", "brewing", "taproom", "brewpub"], ["bar", "wine_bar"]],
    ["wine_bar", "Wine bar", "Bar de vinos", ["wine_bar"], ["wine bar"], ["bar", "restaurant"]],
    ["cocktail_lounge", "Cocktail lounge", "Bar de cócteles", [], ["cocktail", "cocktails", "lounge", "speakeasy"], ["bar", "wine_bar"]],
    ["nightclub", "Nightclub", "Discoteca", ["night_club"], ["nightclub", "night club"], ["bar", "cocktail_lounge"]],
    ["hookah_lounge", "Hookah lounge", "Narguilería", [], ["hookah"], ["cocktail_lounge", "bar"]],
  ],
  bakery: [
    ["bagel_shop", "Bagel shop", "Tienda de bagels", ["bagel_shop"], ["bagel", "bagels"], ["cafe", "deli", "breakfast_brunch"]],
    ["cake_shop", "Cake shop", "Pastelería de tortas", ["cake_shop"], ["cake", "cakes"], ["bakery", "dessert_shop"]],
    ["pastry_shop", "Pastry shop", "Pastelería", ["pastry_shop"], ["patisserie", "pâtisserie", "pastry", "pastries"], ["bakery", "cafe"]],
    ["panaderia", "Latin bakery (panadería)", "Panadería latina", [], ["panadería", "panaderia", "pan dulce"], ["bakery", "international_market"]],
  ],
  liquor_store: [
    ["wine_shop", "Wine shop", "Tienda de vinos", [], ["wine shop", "wine warehouse", "wines", "wine & spirits", "wine and spirits"], ["liquor_store", "wine_bar"]],
    ["beer_store", "Beer store", "Tienda de cerveza", [], ["beer store", "craft beer", "growler", "growlers", "beer distributor"], ["liquor_store", "brewery"]],
  ],
  grocery_market: [
    ["convenience_store", "Convenience store", "Tienda de conveniencia", ["convenience_store"], ["convenience", "mini mart", "minimart", "bodega", "corner store"], ["grocery_market", "deli", "vape_smoke", "gas_station"]],
    ["butcher", "Butcher", "Carnicería", ["butcher_shop"], ["butcher", "meat market", "carnicería", "carniceria"], ["grocery_market", "deli"]],
    ["seafood_market", "Seafood market", "Pescadería", [], ["fish market", "seafood market", "pescadería"], ["grocery_market", "seafood"]],
    ["international_market", "International market", "Mercado internacional", ["asian_grocery_store"], ["halal", "latin market", "indian grocery", "mercado", "asian market", "h mart"], ["grocery_market"]],
    ["health_food", "Health food store", "Tienda naturista", [], ["health food", "organic market", "vitamins", "natural foods"], ["grocery_market", "juice_bar"]],
    ["specialty_food", "Specialty food & cheese", "Gourmet y quesos", [], ["gourmet", "cheese shop", "cheesemonger", "olive oil"], ["deli", "wine_shop"]],
    ["gas_station", "Gas station", "Gasolinera", ["gas_station"], ["gas station", "fuel", "gasolinera"], ["convenience_store", "car_wash_detailing"]],
  ],
  restaurant: [
    ["pizza", "Pizza", "Pizzería", ["pizza_restaurant"], ["pizza", "pizzeria", "pizzería"], ["burgers", "sandwiches", "italian"]],
    ["burgers", "Burgers", "Hamburguesas", ["hamburger_restaurant"], ["burger", "burgers"], ["pizza", "chicken_wings", "fast_food"]],
    ["chicken_wings", "Chicken & wings", "Pollo y alitas", ["chicken_restaurant", "chicken_wings_restaurant"], ["wings", "hot chicken", "fried chicken", "chicken"], ["burgers", "fast_food", "sports_bar"]],
    ["sandwiches", "Sandwiches & subs", "Sándwiches", ["sandwich_shop"], ["subs", "hoagie", "hoagies", "cheesesteak", "steak shop", "sandwich", "sandwiches"], ["deli", "pizza", "bagel_shop"]],
    ["deli", "Deli", "Deli", ["deli"], ["deli", "delicatessen"], ["sandwiches", "italian", "specialty_food"]],
    ["mexican", "Mexican", "Mexicana", ["mexican_restaurant", "taco_restaurant", "burrito_restaurant", "tex_mex_restaurant"], ["taco", "tacos", "burrito", "burritos", "mexican", "cantina", "taqueria", "taquería"], ["latin_american", "fast_food", "food_truck"]],
    ["latin_american", "Latin American", "Latinoamericana", ["latin_american_restaurant", "brazilian_restaurant", "peruvian_restaurant", "colombian_restaurant"], ["arepa", "arepas", "pupusa", "pupusas", "empanada", "empanadas"], ["mexican", "caribbean"]],
    ["caribbean", "Caribbean", "Caribeña", ["caribbean_restaurant", "cuban_restaurant"], ["jerk", "jamaican", "cuban", "caribbean"], ["latin_american"]],
    ["chinese", "Chinese", "China", ["chinese_restaurant"], ["chinese", "dim sum", "szechuan", "sichuan", "yun nan"], ["noodles_ramen", "korean", "thai"]],
    ["japanese_sushi", "Japanese & sushi", "Japonesa y sushi", ["japanese_restaurant", "sushi_restaurant"], ["sushi", "poke", "japanese", "hibachi"], ["noodles_ramen", "korean"]],
    ["korean", "Korean", "Coreana", ["korean_restaurant"], ["korean", "korean bbq", "bibimbap"], ["chinese", "japanese_sushi"]],
    ["thai", "Thai", "Tailandesa", ["thai_restaurant"], ["thai"], ["vietnamese", "chinese"]],
    ["vietnamese", "Vietnamese", "Vietnamita", ["vietnamese_restaurant"], ["pho", "bánh mì", "banh mi", "vietnamese"], ["thai", "sandwiches"]],
    ["indian", "Indian & Nepali", "India y Nepal", ["indian_restaurant"], ["curry", "tandoori", "indian", "nepali", "masala"], ["mediterranean"]],
    ["noodles_ramen", "Noodles & ramen", "Fideos y ramen", ["ramen_restaurant", "noodle_shop"], ["ramen", "noodle", "noodles"], ["japanese_sushi", "chinese"]],
    ["italian", "Italian", "Italiana", ["italian_restaurant"], ["italian", "trattoria", "ristorante", "pasta"], ["pizza", "mediterranean"]],
    ["mediterranean", "Mediterranean & Middle Eastern", "Mediterránea y de Medio Oriente", ["mediterranean_restaurant", "middle_eastern_restaurant", "lebanese_restaurant", "turkish_restaurant"], ["falafel", "shawarma", "gyro", "gyros", "kebab", "mediterranean"], ["greek", "salad_bowls"]],
    ["greek", "Greek", "Griega", ["greek_restaurant"], ["greek"], ["mediterranean"]],
    ["american_diner", "American & diner", "Americana y cafetería", ["american_restaurant", "diner"], ["diner"], ["breakfast_brunch", "burgers"]],
    ["breakfast_brunch", "Breakfast & brunch", "Desayunos", ["breakfast_restaurant", "brunch_restaurant"], ["pancake", "pancakes", "brunch", "breakfast"], ["american_diner", "cafe", "bagel_shop"]],
    ["bbq", "BBQ", "Barbacoa", ["barbecue_restaurant"], ["bbq", "barbecue", "smokehouse"], ["american_diner", "chicken_wings"]],
    ["seafood", "Seafood", "Mariscos", ["seafood_restaurant"], ["crab", "oyster", "oysters", "seafood", "lobster"], ["steakhouse", "seafood_market"]],
    ["steakhouse", "Steakhouse", "Asador", ["steak_house"], ["steakhouse", "steak house", "chophouse"], ["seafood"]],
    ["vegan", "Vegan & vegetarian", "Vegana y vegetariana", ["vegan_restaurant", "vegetarian_restaurant"], ["vegan", "vegetarian", "plant based", "plant-based"], ["salad_bowls", "juice_bar"]],
    ["salad_bowls", "Salad & bowls", "Ensaladas y bowls", ["salad_shop"], ["salad", "salads", "bowls", "honeygrow", "sweetgreen"], ["vegan", "mediterranean", "fast_food"]],
    ["fast_food", "Fast food", "Comida rápida", ["fast_food_restaurant"], ["fast food"], ["burgers", "chicken_wings", "pizza"]],
    ["food_truck", "Food truck", "Food truck", [], ["food truck"], ["mexican", "fast_food"]],
    ["food_hall", "Food hall (several cuisines)", "Patio de comidas", ["food_court"], ["food hall", "food court", "wonder"], ["restaurant"]],
    ["catering", "Catering", "Catering", [], ["catering", "caterer", "caterers"], ["events", "restaurant"]],
  ],
  hardware_store: [
    ["home_improvement", "Home improvement", "Mejoras para el hogar", ["home_improvement_store", "building_materials_store"], ["home improvement", "lumber", "building supply"], ["hardware_store"]],
    ["paint_store", "Paint store", "Tienda de pintura", ["paint_store"], ["paint", "paints"], ["hardware_store"]],
    ["garden_center", "Garden center & nursery", "Vivero", ["garden_center"], ["nursery", "garden center", "garden centre"], ["florist", "hardware_store"]],
  ],
  florist: [],
  retail_boutique: [
    ["womens_clothing", "Women's clothing", "Ropa de mujer", ["womens_clothing_store"], ["women's clothing", "womens clothing", "ladies"], ["department_store", "shoe_store", "thrift_vintage"]],
    ["mens_clothing", "Men's clothing", "Ropa de hombre", ["mens_clothing_store"], ["men's clothing", "mens clothing", "menswear"], ["department_store", "tailor"]],
    ["kids_clothing", "Kids' clothing", "Ropa infantil", ["childrens_clothing_store"], ["children's clothing", "kids clothing", "baby clothes"], ["toy_hobby", "department_store"]],
    ["shoe_store", "Shoe store", "Zapatería", ["shoe_store"], ["shoes", "shoe store", "footwear", "zapatería"], ["retail_boutique", "sporting_goods", "sneakers_streetwear"]],
    ["sneakers_streetwear", "Sneakers & streetwear", "Tenis y ropa urbana", [], ["sneaker", "sneakers", "streetwear", "kicks"], ["shoe_store", "skate_snow", "retail_boutique"]],
    ["thrift_vintage", "Thrift & vintage", "Segunda mano y vintage", ["thrift_store"], ["thrift", "consignment", "vintage", "secondhand", "resale"], ["retail_boutique", "record_store"]],
    ["bridal_formal", "Bridal & formal wear", "Novias y gala", ["bridal_shop"], ["bridal", "prom", "tuxedo", "tuxedos", "formal wear"], ["tailor", "womens_clothing"]],
    ["gift_shop", "Gift shop", "Tienda de regalos", ["gift_shop"], ["gift", "gifts", "gift shop"], ["florist", "candy_chocolate", "bookstore"]],
    ["department_store", "Department store", "Tienda departamental", ["department_store"], ["department store"], ["discount_variety", "retail_boutique", "furniture_decor"]],
    ["discount_variety", "Discount & variety store", "Tienda de variedades", ["discount_store"], ["dollar", "variety", "five and dime", "5 & 10", "5 and 10", "99 cent"], ["convenience_store", "gift_shop", "department_store"]],
  ],
  specialty_store: [
    ["furniture_decor", "Furniture & home decor", "Muebles y decoración", ["furniture_store", "home_goods_store"], ["furniture", "home decor", "home goods"], ["department_store", "mattress"]],
    ["mattress", "Mattress store", "Colchones", [], ["mattress", "mattresses"], ["furniture_decor"]],
    ["skate_snow", "Skate & snow shop", "Tienda de skate y snowboard", [], ["skate", "skateboard", "skateboards", "snowboard", "snowboards", "surf", "board shop", "snow"], ["sporting_goods", "sneakers_streetwear", "retail_boutique", "shoe_store"]],
    ["sporting_goods", "Sporting goods", "Artículos deportivos", ["sporting_goods_store"], ["sporting goods", "sports", "athletic"], ["outdoor", "bike_shop", "hockey_team"]],
    ["hockey_team", "Hockey & team sports", "Hockey y deportes de equipo", [], ["hockey", "lacrosse", "team sports"], ["sporting_goods", "skate_snow"]],
    ["outdoor", "Outdoor & camping", "Aire libre y camping", [], ["outdoor", "outdoors", "camping", "hunting", "tackle", "ski", "fishing"], ["sporting_goods"]],
    ["bike_shop", "Bike shop", "Tienda de bicicletas", ["bicycle_store"], ["bike", "bikes", "bicycle", "bicycles", "cycles", "cyclery"], ["sporting_goods", "outdoor"]],
    ["running_store", "Running store", "Tienda de running", [], ["running store", "running company", "runner's"], ["shoe_store", "sporting_goods"]],
    ["dance_supply", "Dance supply", "Artículos de danza", [], ["dance supply", "dancewear", "dancer's", "dancers"], ["retail_boutique", "shoe_store", "party_costume"]],
    ["music_store", "Music & instrument store", "Tienda de música e instrumentos", ["musical_instrument_store"], ["guitar", "guitars", "music store", "instruments", "piano store", "drum shop"], ["music_lessons", "record_store", "pawn_shop"]],
    ["record_store", "Record store", "Tienda de discos", [], ["records", "vinyl"], ["music_store", "bookstore", "comics_collectibles"]],
    ["bookstore", "Bookstore", "Librería", ["book_store"], ["books", "bookstore", "booksellers", "librería"], ["comics_collectibles", "gift_shop"]],
    ["comics_collectibles", "Comics & collectibles", "Cómics y coleccionables", [], ["comic", "comics", "collectibles", "trading card", "trading cards", "pop culture"], ["toy_hobby", "record_store"]],
    ["toy_hobby", "Toy, game & hobby store", "Juguetes, juegos y pasatiempos", ["toy_store"], ["toy", "toys", "hobby", "hobbies", "board games", "video games", "games"], ["comics_collectibles", "gift_shop"]],
    ["craft_fabric", "Craft & fabric", "Manualidades y telas", ["craft_store"], ["craft", "crafts", "fabric", "fabrics", "yarn", "art supply"], ["toy_hobby", "gift_shop"]],
    ["party_costume", "Party & costume", "Fiestas y disfraces", [], ["party supply", "party city", "costume", "costumes", "balloon", "balloons"], ["gift_shop", "craft_fabric"]],
    ["vape_smoke", "Vape & smoke shop", "Vapeo y tabaco", ["tobacco_shop"], ["vape", "vapor", "smoke shop", "tobacco", "cbd", "hookah supply"], ["convenience_store", "liquor_store"]],
    ["electronics", "Phone & electronics store", "Teléfonos y electrónica", ["electronics_store", "cell_phone_store"], ["wireless", "electronics", "cell phone store", "mobile store"], ["phone_repair", "department_store"]],
    ["jewelry", "Jewelry store", "Joyería", ["jewelry_store"], ["jewelry", "jewelers", "jeweler", "jewellery", "joyería"], ["watch_repair", "pawn_shop", "gift_shop"]],
    ["pawn_shop", "Pawn shop", "Casa de empeño", ["pawn_shop"], ["pawn"], ["jewelry", "electronics", "music_store"]],
    ["beauty_supply", "Beauty supply", "Artículos de belleza", ["beauty_supply_store"], ["beauty supply"], ["pharmacy", "hair_salon"]],
    ["eyewear", "Eyewear & optical store", "Óptica", ["optician"], ["eyewear", "optical", "eyeglasses", "glasses", "óptica"], ["eye_care", "department_store"]],
    ["auto_parts", "Auto parts store", "Refaccionaria", ["auto_parts_store"], ["auto parts", "car parts", "autozone", "napa"], ["auto_repair", "tire_shop"]],
    ["print_sign", "Print & sign shop", "Imprenta y rótulos", ["print_shop"], ["print shop", "printing", "printers", "sign shop", "signs", "imprenta"], ["shipping_mailbox", "marketing_agency"]],
    ["cannabis_dispensary", "Cannabis dispensary", "Dispensario de cannabis", [], ["dispensary", "cannabis"], ["vape_smoke"]],
  ],
  community_center: [
    ["ymca_jcc", "YMCA / JCC", "YMCA / JCC", [], ["ymca", "jcc", "jewish community center"], ["gym_fitness", "swim_school", "childcare", "community_center"]],
    ["recreation_center", "Recreation center", "Centro recreativo", [], ["recreation center", "rec center"], ["community_center", "gym_fitness"]],
    ["senior_center", "Senior center", "Centro para mayores", [], ["senior center", "senior centre"], ["community_center"]],
  ],
  gym_fitness: [
    ["yoga", "Yoga studio", "Estudio de yoga", ["yoga_studio"], ["yoga"], ["pilates", "barre", "gym_fitness"]],
    ["pilates", "Pilates studio", "Estudio de pilates", ["pilates_studio"], ["pilates", "reformer"], ["yoga", "barre"]],
    ["barre", "Barre studio", "Estudio de barre", [], ["barre"], ["pilates", "yoga", "dance_studio"]],
    ["crossfit", "CrossFit & boot camp", "CrossFit y entrenamiento", [], ["crossfit", "boot camp", "bootcamp", "hiit"], ["gym_fitness", "boxing"]],
    ["boxing", "Boxing & kickboxing", "Boxeo", [], ["boxing", "kickboxing"], ["martial_arts", "gym_fitness"]],
    ["martial_arts", "Martial arts", "Artes marciales", ["martial_arts_school"], ["martial arts", "karate", "taekwondo", "tae kwon do", "jiu jitsu", "jiu-jitsu", "kung fu", "mma", "judo"], ["boxing", "dance_studio", "after_school"]],
    ["dance_studio", "Dance studio", "Estudio de baile", ["dance_studio"], ["dance studio", "dance school", "dance academy", "salsa", "dance"], ["ballet", "martial_arts", "music_lessons"]],
    ["ballet", "Ballet school", "Escuela de ballet", [], ["ballet"], ["dance_studio"]],
    ["cycling_studio", "Cycling studio", "Estudio de ciclismo", [], ["spin", "cycling studio", "cycle studio"], ["gym_fitness"]],
    ["climbing_gym", "Climbing gym", "Escalada", [], ["climbing", "bouldering"], ["gym_fitness", "trampoline_park"]],
    ["swim_school", "Swim school", "Escuela de natación", ["swimming_pool"], ["swim school", "swim lessons", "swimming lessons", "aquatics"], ["community_center"]],
    ["personal_training", "Personal training studio", "Entrenamiento personal", [], ["personal training", "personal trainer"], ["gym_fitness"]],
  ],
  pet_services: [
    ["veterinarian", "Veterinarian", "Veterinaria", ["veterinary_care"], ["vet", "veterinary", "animal hospital", "veterinaria"], ["pet_grooming"]],
    ["pet_grooming", "Pet grooming", "Peluquería canina", [], ["grooming", "groomer", "groomers", "dog grooming"], ["pet_boarding", "pet_store"]],
    ["pet_boarding", "Boarding & doggy daycare", "Guardería de mascotas", [], ["kennel", "kennels", "boarding", "doggy daycare", "dog daycare"], ["pet_grooming", "pet_sitting"]],
    ["dog_training", "Dog training", "Adiestramiento canino", [], ["dog training", "dog trainer"], ["pet_boarding"]],
    ["pet_sitting", "Pet sitting & walking", "Cuidado de mascotas", [], ["pet sitting", "pet sitter", "dog walking", "dog walker"], ["pet_boarding"]],
    ["pet_store", "Pet store", "Tienda de mascotas", ["pet_store"], ["pet store", "pet supply", "pet supplies", "petco", "petsmart"], ["pet_grooming"]],
  ],
  dentist: [
    ["orthodontist", "Orthodontist", "Ortodoncista", ["orthodontist"], ["orthodontics", "orthodontist", "orthodontic", "braces"], ["dentist"]],
    ["pediatric_dentist", "Pediatric dentist", "Dentista pediátrico", [], ["pediatric dentist", "pediatric dentistry", "kids dentist"], ["dentist"]],
    ["cosmetic_dentist", "Cosmetic dentist", "Dentista estético", [], ["cosmetic dentist", "cosmetic dentistry", "veneers"], ["dentist", "med_spa"]],
  ],
  medical_clinic: [
    ["urgent_care", "Urgent care", "Atención de urgencias", [], ["urgent care", "walk-in clinic", "walk in clinic"], ["medical_clinic"]],
    ["chiropractor", "Chiropractor", "Quiropráctico", ["chiropractor"], ["chiropractic", "chiropractor"], ["physical_therapy", "massage"]],
    ["physical_therapy", "Physical therapy", "Fisioterapia", ["physiotherapist"], ["physical therapy", "physiotherapy", "rehab"], ["chiropractor", "massage"]],
    ["eye_care", "Eye care & optometrist", "Optometría", ["optometrist"], ["optometrist", "optometry", "eye doctor", "eye care", "vision center"], ["eyewear"]],
    ["dermatology", "Dermatology", "Dermatología", ["dermatologist"], ["dermatology", "dermatologist", "skin clinic"], ["med_spa"]],
    ["pharmacy", "Pharmacy", "Farmacia", ["pharmacy", "drugstore"], ["pharmacy", "drugstore", "farmacia", "cvs", "walgreens"], ["convenience_store", "grocery_market"]],
  ],
  practitioner: [
    ["therapist", "Therapist & counselor", "Terapia y consejería", ["psychologist"], ["therapist", "therapy", "counseling", "counselor", "psychologist", "psychotherapy"], ["coach"]],
    ["acupuncture", "Acupuncture", "Acupuntura", [], ["acupuncture", "acupuncturist"], ["massage", "chiropractor"]],
    ["nutrition", "Nutrition & dietitian", "Nutrición", [], ["nutritionist", "dietitian", "nutrition"], ["personal_training", "coach"]],
    ["speech_ot", "Speech & occupational therapy", "Terapia del habla y ocupacional", [], ["speech therapy", "occupational therapy", "speech pathology"], ["therapist"]],
  ],
  lawyer: [
    ["personal_injury", "Personal injury law", "Lesiones personales", [], ["injury", "accident", "accidents"], ["lawyer"]],
    ["family_law", "Family law", "Derecho familiar", [], ["family law", "divorce", "custody"], ["lawyer"]],
    ["criminal_defense", "Criminal defense", "Defensa penal", [], ["criminal", "dui", "dwi", "criminal defense"], ["lawyer"]],
    ["immigration_law", "Immigration law", "Derecho migratorio", [], ["immigration"], ["lawyer"]],
    ["estate_planning", "Estate planning", "Planificación patrimonial", [], ["estate planning", "wills", "probate", "elder law", "trusts"], ["accountant", "lawyer"]],
    ["business_law", "Business law", "Derecho empresarial", [], ["business law", "corporate law", "business attorney"], ["accountant", "consultant"]],
    ["real_estate_law", "Real estate law", "Derecho inmobiliario", [], ["real estate attorney", "real estate law", "closing attorney"], ["real_estate", "lawyer"]],
    ["employment_law", "Employment law", "Derecho laboral", [], ["employment law", "employment attorney", "workers compensation", "workers' compensation"], ["lawyer"]],
    ["consumer_law", "Consumer & lemon law", "Derecho del consumidor", [], ["lemon law", "consumer law", "consumer protection"], ["personal_injury", "lawyer"]],
    ["bankruptcy", "Bankruptcy law", "Quiebras", [], ["bankruptcy"], ["lawyer"]],
  ],
  accountant: [
    ["tax_prep", "Tax preparation", "Preparación de impuestos", ["tax_preparation_service"], ["tax service", "tax prep", "tax preparation", "taxes", "h&r block"], ["accountant"]],
    ["bookkeeping", "Bookkeeping", "Teneduría de libros", [], ["bookkeeping", "bookkeeper"], ["accountant"]],
  ],
  real_estate: [
    ["property_management", "Property management", "Administración de propiedades", [], ["property management", "property manager"], ["real_estate"]],
    ["mortgage", "Mortgage broker", "Corredor hipotecario", [], ["mortgage", "home loans"], ["real_estate"]],
  ],
  consultant: [
    ["insurance_agency", "Insurance agency", "Agencia de seguros", ["insurance_agency"], ["insurance"], ["financial_advisor"]],
    ["financial_advisor", "Financial advisor", "Asesor financiero", ["financial_planner"], ["financial advisor", "financial planning", "wealth management", "investments"], ["insurance_agency", "accountant"]],
    ["marketing_agency", "Marketing & web agency", "Agencia de marketing", ["marketing_agency"], ["marketing agency", "web design", "seo", "digital marketing", "advertising agency"], ["consultant", "it_services"]],
    ["it_services", "IT services", "Servicios de TI", [], ["it services", "managed it", "it support", "computer services"], ["phone_repair", "marketing_agency"]],
  ],
  coach: [],
  tutor_education: [
    ["learning_center", "Learning center", "Centro de aprendizaje", [], ["learning center", "kumon", "mathnasium", "sylvan"], ["tutor_education"]],
    ["test_prep", "Test prep", "Preparación de exámenes", [], ["test prep", "sat prep", "act prep"], ["tutor_education"]],
    ["music_lessons", "Music lessons & piano teacher", "Clases de música y piano", [], ["music lessons", "piano lessons", "piano teacher", "guitar lessons", "voice lessons", "piano"], ["music_school", "music_store", "dance_studio"]],
    ["music_school", "Music school", "Escuela de música", [], ["music school", "conservatory", "school of music"], ["music_lessons"]],
    ["language_school", "Language school", "Escuela de idiomas", [], ["language school", "esl", "spanish lessons", "english classes"], ["tutor_education"]],
    ["art_classes", "Art & pottery classes", "Clases de arte", [], ["art class", "art classes", "pottery", "paint and sip", "ceramics studio"], ["craft_fabric", "after_school"]],
    ["coding_stem", "Coding & STEM", "Programación y STEM", [], ["coding", "stem", "robotics"], ["tutor_education"]],
    ["driving_school", "Driving school", "Autoescuela", ["driving_school"], ["driving school", "driver training"], ["tutor_education"]],
  ],
  photographer: [
    ["wedding_photographer", "Wedding & event photographer", "Fotografía de bodas y eventos", [], ["wedding photography", "wedding photographer", "event photography"], ["videographer", "events"]],
    ["photo_studio", "Photo studio", "Estudio fotográfico", [], ["photo studio", "photography studio"], ["photographer"]],
    ["videographer", "Videographer", "Videografía", [], ["videographer", "videography", "video production"], ["photographer"]],
  ],
  auto_repair: [
    ["auto_body", "Auto body & collision", "Carrocería", ["auto_body_shop"], ["auto body", "collision", "body shop"], ["auto_repair"]],
    ["tire_shop", "Tire shop", "Llantera", ["tire_shop"], ["tire", "tires", "llantera"], ["auto_repair", "oil_change"]],
    ["oil_change", "Oil change", "Cambio de aceite", [], ["oil change", "lube", "jiffy lube", "valvoline"], ["auto_repair", "car_wash_detailing"]],
    ["auto_glass", "Auto glass", "Vidrios automotrices", [], ["auto glass", "windshield"], ["auto_body"]],
    ["car_dealer", "Used car dealer", "Autos usados", ["car_dealer"], ["used cars", "auto sales", "car sales", "motors"], ["auto_repair"]],
    ["motorcycle", "Motorcycle shop", "Motocicletas", ["motorcycle_dealer"], ["motorcycle", "motorcycles", "harley"], ["auto_repair"]],
  ],
  plumber: [
    ["drain_sewer", "Drain & sewer", "Drenajes", [], ["drain", "sewer", "rooter"], ["plumber"]],
  ],
  electrician: [],
  home_services: [
    ["hvac", "HVAC", "Calefacción y aire acondicionado", [], ["hvac", "heating", "air conditioning", "cooling"], ["plumber", "electrician"]],
    ["roofing", "Roofing", "Techos", ["roofing_contractor"], ["roof", "roofing", "roofer"], ["general_contractor"]],
    ["handyman", "Handyman", "Reparaciones generales", [], ["handyman"], ["general_contractor", "painting_contractor"]],
    ["painting_contractor", "Painting contractor", "Pintor", ["painter"], ["painting contractor", "painter", "painters", "house painting"], ["handyman"]],
    ["general_contractor", "General contractor & remodeling", "Contratista y remodelación", ["general_contractor"], ["contractor", "contractors", "remodel", "remodeling", "renovation", "construction"], ["handyman", "roofing"]],
    ["pest_control", "Pest control", "Control de plagas", [], ["pest", "exterminator", "termite"], ["home_services"]],
    ["movers", "Movers", "Mudanzas", ["moving_company"], ["movers", "moving company", "moving"], ["junk_removal"]],
    ["junk_removal", "Junk removal", "Retiro de basura", [], ["junk removal", "junk"], ["movers"]],
    ["garage_door", "Garage door", "Puertas de garaje", [], ["garage door", "garage doors"], ["handyman"]],
    ["pool_service", "Pool service", "Servicio de piscinas", [], ["pool service", "pool cleaning", "pool supply", "pool supplies", "pool"], ["landscaper"]],
    ["solar", "Solar installer", "Paneles solares", [], ["solar"], ["electrician"]],
  ],
  landscaper: [
    ["lawn_care", "Lawn care", "Cuidado del césped", [], ["lawn care", "lawn service", "mowing", "lawn"], ["landscaper"]],
    ["tree_service", "Tree service", "Poda de árboles", [], ["tree service", "arborist", "tree removal"], ["landscaper"]],
    ["snow_removal", "Snow removal", "Remoción de nieve", [], ["snow removal", "snow plowing", "plowing"], ["landscaper"]],
  ],
  cleaning_service: [
    ["commercial_cleaning", "Commercial cleaning", "Limpieza comercial", [], ["janitorial", "commercial cleaning", "office cleaning"], ["cleaning_service"]],
    ["carpet_cleaning", "Carpet & upholstery cleaning", "Limpieza de alfombras", [], ["carpet cleaning", "upholstery cleaning"], ["cleaning_service"]],
    ["pressure_washing", "Window & pressure washing", "Lavado a presión y ventanas", [], ["window cleaning", "pressure washing", "power washing"], ["cleaning_service"]],
  ],
  repair_dropoff: [
    ["dry_cleaner", "Dry cleaner", "Tintorería", ["dry_cleaner"], ["dry clean", "dry cleaner", "dry cleaners", "dry cleaning", "cleaners", "tintorería"], ["tailor", "laundromat"]],
    ["laundromat", "Laundromat", "Lavandería", ["laundry"], ["laundromat", "laundry", "wash and fold", "coin laundry", "lavandería"], ["dry_cleaner"]],
    ["shoe_repair", "Shoe repair", "Reparación de calzado", [], ["shoe repair", "cobbler", "shoe tech"], ["tailor", "dry_cleaner"]],
    ["tailor", "Tailor & alterations", "Sastrería", [], ["tailor", "tailoring", "alterations", "sastrería"], ["dry_cleaner", "bridal_formal"]],
    ["phone_repair", "Phone & computer repair", "Reparación de teléfonos y computadoras", ["electronics_repair_shop"], ["phone repair", "computer repair", "screen repair", "iphone repair", "cell phone repair"], ["electronics", "it_services"]],
    ["watch_repair", "Watch & jewelry repair", "Reparación de relojes y joyas", [], ["watch repair", "jewelry repair"], ["jewelry"]],
    ["appliance_repair", "Appliance repair", "Reparación de electrodomésticos", [], ["appliance repair", "appliance"], ["handyman"]],
    ["locksmith", "Locksmith", "Cerrajería", ["locksmith"], ["locksmith", "cerrajería"], ["hardware_store"]],
  ],
  car_wash_detailing: [
    ["detailing", "Auto detailing", "Detallado de autos", [], ["detailing", "auto detail", "car detail"], ["car_wash_detailing"]],
  ],
  recreation: [
    ["bowling", "Bowling", "Boliche", ["bowling_alley"], ["bowling", "lanes"], ["arcade"]],
    ["arcade", "Arcade & family fun center", "Arcade y centro de diversión", ["amusement_center"], ["arcade", "family fun", "fun center"], ["bowling", "trampoline_park"]],
    ["trampoline_park", "Trampoline park", "Parque de trampolines", [], ["trampoline", "trampolines"], ["climbing_gym", "arcade"]],
    ["escape_room", "Escape room", "Escape room", [], ["escape room", "escape rooms"], ["axe_paintball", "arcade"]],
    ["axe_paintball", "Axe throwing & paintball", "Lanzamiento de hachas y paintball", [], ["axe throwing", "paintball", "laser tag"], ["escape_room"]],
    ["golf", "Golf & mini golf", "Golf y minigolf", ["golf_course"], ["mini golf", "golf", "putt"], ["arcade"]],
    ["water_sports", "Water sports & boat tours", "Deportes acuáticos y paseos en bote", [], ["watersports", "water sports", "jet ski", "jetski", "kayak", "boat tour", "boat rental", "parasail"], ["tour_operator"]],
    ["tour_operator", "Tour operator", "Operador turístico", ["tour_agency"], ["tours", "tour company"], ["water_sports", "travel_agency"]],
    ["travel_agency", "Travel agency", "Agencia de viajes", ["travel_agency"], ["travel agency", "travel agent", "agencia de viajes"], ["tour_operator"]],
  ],
  events: [
    ["wedding_venue", "Wedding venue", "Lugar para bodas", ["wedding_venue"], ["wedding venue"], ["events"]],
    ["party_rentals", "Party rentals", "Alquiler para fiestas", [], ["party rental", "party rentals", "bounce house", "tent rental"], ["event_planner"]],
    ["dj", "DJ & entertainment", "DJ y entretenimiento", [], ["dj", "djs", "disc jockey"], ["event_planner"]],
    ["event_planner", "Event & wedding planner", "Organizador de eventos", [], ["event planner", "event planning", "wedding planner"], ["events"]],
    ["funeral_home", "Funeral home", "Funeraria", ["funeral_home"], ["funeral", "funeral home", "mortuary", "funeraria"], ["events"]],
  ],
  childcare: [
    ["preschool", "Preschool", "Preescolar", ["preschool"], ["preschool", "pre-k", "montessori"], ["childcare"]],
    ["after_school", "After-school program", "Programa extraescolar", [], ["after school", "after-school", "afterschool"], ["martial_arts", "dance_studio", "tutor_education"]],
    ["summer_camp", "Summer camp", "Campamento de verano", [], ["summer camp", "day camp"], ["community_center", "ymca_jcc"]],
  ],
  lodging: [
    ["motel", "Motel", "Motel", ["motel"], ["motel"], ["lodging"]],
    ["bed_breakfast", "Bed & breakfast & inn", "Posada y B&B", ["bed_and_breakfast"], ["inn", "b&b", "bed and breakfast", "bed & breakfast"], ["lodging", "vacation_rental"]],
    ["vacation_rental", "Vacation rental", "Alquiler vacacional", [], ["vacation rental", "cottage", "cabins"], ["bed_breakfast"]],
  ],
  tattoo_body_art: [
    ["piercing", "Piercing studio", "Estudio de perforaciones", [], ["piercing", "piercings"], ["tattoo_body_art", "jewelry"]],
    ["permanent_makeup", "Permanent makeup", "Maquillaje permanente", [], ["permanent makeup", "microblading"], ["lash_brow"]],
  ],
  nonprofit: [],
  place_of_worship: [],
  default: [
    ["self_storage", "Self storage", "Almacenamiento", ["storage"], ["self storage", "storage units", "mini storage"], ["movers"]],
    ["shipping_mailbox", "Shipping & mailbox store", "Envíos y apartados postales", [], ["ups store", "shipping", "mailbox", "mailboxes", "pack and ship", "postal"], ["print_sign"]],
  ],
};

/** The parent general niches: Google types/keywords that mean "this parent". */
const GENERAL_TYPES: Partial<Record<BusinessTypeId, string[]>> = {
  barbershop: ["barber_shop"],
  salon: ["beauty_salon", "hair_care"],
  nail_salon: ["nail_salon"],
  spa: ["spa", "day_spa"],
  dessert_shop: ["dessert_shop"],
  cafe: ["cafe", "coffee_shop"],
  bar: ["bar", "pub"],
  bakery: ["bakery"],
  liquor_store: ["liquor_store"],
  grocery_market: ["grocery_store", "supermarket"],
  restaurant: ["restaurant", "meal_takeaway"],
  hardware_store: ["hardware_store"],
  florist: ["florist"],
  retail_boutique: ["clothing_store", "boutique"],
  specialty_store: ["store"],
  community_center: ["community_center"],
  gym_fitness: ["gym", "fitness_center"],
  dentist: ["dentist", "dental_clinic"],
  medical_clinic: ["doctor", "medical_clinic", "hospital"],
  lawyer: ["lawyer"],
  accountant: ["accounting"],
  real_estate: ["real_estate_agency"],
  consultant: ["consultant"],
  auto_repair: ["car_repair"],
  plumber: ["plumber"],
  electrician: ["electrician"],
  car_wash_detailing: ["car_wash"],
  childcare: ["child_care_agency"],
  lodging: ["hotel", "lodging"],
  place_of_worship: ["church", "synagogue", "mosque", "hindu_temple", "place_of_worship"],
};

const GENERAL_KEYWORDS: Partial<Record<BusinessTypeId, string[]>> = {
  barbershop: ["barber", "barbershop", "barbería"],
  nail_salon: ["nail", "nails"],
  spa: ["spa", "day spa"],
  dessert_shop: ["dessert", "desserts", "cookies", "cupcakes", "crepes"],
  cafe: ["coffee", "café", "cafe", "espresso"],
  bar: ["bar", "pub", "tavern"],
  bakery: ["bakery", "bakeshop", "bakehouse"],
  liquor_store: ["liquor", "liquors", "spirits", "package store"],
  grocery_market: ["grocery", "supermarket", "market"],
  florist: ["florist", "flowers", "floral"],
  retail_boutique: ["boutique", "clothing", "apparel"],
  gym_fitness: ["gym", "fitness"],
  dentist: ["dental", "dentist", "dentistry"],
  medical_clinic: ["medical", "family medicine", "primary care", "clinic"],
  lawyer: ["law", "lawyer", "lawyers", "attorney", "attorneys", "legal"],
  accountant: ["cpa", "accounting", "accountant", "accountants"],
  real_estate: ["realty", "realtor", "realtors", "real estate"],
  consultant: ["consulting", "consultant", "consultants"],
  coach: ["coach", "coaching"],
  tutor_education: ["tutor", "tutoring", "tutors"],
  photographer: ["photographer", "photography", "headshots", "portraits"],
  auto_repair: ["auto repair", "mechanic", "automotive", "garage"],
  plumber: ["plumber", "plumbing"],
  electrician: ["electrician", "electrical", "electric"],
  landscaper: ["landscaping", "landscaper", "landscape"],
  cleaning_service: ["house cleaning", "maid", "maids", "cleaning service"],
  car_wash_detailing: ["car wash"],
  childcare: ["daycare", "day care", "child care", "childcare"],
  lodging: ["hotel", "suites"],
  tattoo_body_art: ["tattoo", "tattoos"],
  nonprofit: ["nonprofit", "non-profit", "foundation", "food bank", "charity"],
  place_of_worship: ["church", "temple", "synagogue", "mosque", "parish"],
  events: ["event venue", "banquet", "events"],
  recreation: ["recreation", "fun"],
  repair_dropoff: ["repair"],
};

function rows(parent: BusinessTypeId, list: Row[]): NicheDef[] {
  return list.map(([id, en, es, googleTypes, keywords, areas]) => ({ id, parent, label: { en, es }, googleTypes, keywords, areas }));
}

/** Parent labels for the general niches (filled by lib/niches.ts from the
 * parent business types' own EN + ES labels). */
export const NICHE_PARENTS = Object.keys(GENERAL_AREAS) as BusinessTypeId[];

/** Every specific niche (general niches are built from the parents). */
export const SPECIFIC_NICHES: NicheDef[] = (Object.entries(SPECIFIC) as Array<[BusinessTypeId, Row[]]>).flatMap(([parent, list]) => rows(parent, list));

export function generalNicheSignals(parent: BusinessTypeId): { googleTypes: string[]; keywords: string[]; areas: string[] } {
  return { googleTypes: GENERAL_TYPES[parent] ?? [], keywords: GENERAL_KEYWORDS[parent] ?? [], areas: GENERAL_AREAS[parent] ?? [] };
}
