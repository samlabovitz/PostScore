# bizProfileOptions.* — English key list (translation reference)

Supplementary to the 12 `bizProfiles.<id>-en.md` docs — not one of the "12 profiles" itself. These are the ~30 narrower, individually-selectable **business types** in `config/bizProfiles.ts`'s `BUSINESS_TYPE_OPTIONS` (e.g. "Barbershop", "Café / Coffee Shop") that each reuse one of the 12 content profiles' coupons/offers/FAQ/pricing content, but have their own `label` (shown in the "correct your business type" dropdown) and, for most, their own `competitorNoun` override (e.g. "barbershops" instead of the salon content's "salons").

```
key = "full English value"
```

`es` intentionally absent — falls back to English.

Four option ids have **no** `label` key here at all: `salon`, `restaurant`, `practitioner`, `default`. Their `label` is a direct source-level reference to their own content profile's already-keyed label (see the matching `bizprofiles/<id>-en.md` doc) — intentionally not duplicated.

---

## `accountant` (content: `professional_services`)

```
bizProfileOptions.accountant.label = "Accounting & Tax"
bizProfileOptions.accountant.competitorNoun = "accounting firms"
```

## `auto_repair` (content: `trades`)

```
bizProfileOptions.auto_repair.label = "Auto Repair"
bizProfileOptions.auto_repair.competitorNoun = "auto shops"
```

## `bakery` (content: `cafe_bakery`)

```
bizProfileOptions.bakery.label = "Bakery"
bizProfileOptions.bakery.competitorNoun = "bakeries"
```

## `bar` (content: `restaurant`)

```
bizProfileOptions.bar.label = "Bar / Pub"
bizProfileOptions.bar.competitorNoun = "bars"
```

## `barbershop` (content: `salon`)

```
bizProfileOptions.barbershop.label = "Barbershop"
bizProfileOptions.barbershop.competitorNoun = "barbershops"
```

## `cafe` (content: `cafe_bakery`)

```
bizProfileOptions.cafe.label = "Café / Coffee Shop"
bizProfileOptions.cafe.competitorNoun = "cafes"
```

## `cleaning_service` (content: `trades`)

```
bizProfileOptions.cleaning_service.label = "Cleaning Service"
bizProfileOptions.cleaning_service.competitorNoun = "cleaning services"
```

## `coach` (content: `practitioner`)

```
bizProfileOptions.coach.label = "Coaching"
bizProfileOptions.coach.competitorNoun = "coaches"
```

## `consultant` (content: `practitioner`)

```
bizProfileOptions.consultant.label = "Consulting"
bizProfileOptions.consultant.competitorNoun = "consultants"
```

## `dentist` (content: `lawyer`)

```
bizProfileOptions.dentist.label = "Dentist"
bizProfileOptions.dentist.competitorNoun = "dental practices"
```

## `electrician` (content: `trades`)

```
bizProfileOptions.electrician.label = "Electrical"
bizProfileOptions.electrician.competitorNoun = "electricians"
```

## `florist` (content: `retail`)

```
bizProfileOptions.florist.label = "Florist"
bizProfileOptions.florist.competitorNoun = "florists"
```

## `grocery_market` (content: `grocery_market`)

```
bizProfileOptions.grocery_market.label = "Grocery / Market"
bizProfileOptions.grocery_market.competitorNoun = "grocery stores"
```

## `gym_fitness` (content: `gym_fitness`)

```
bizProfileOptions.gym_fitness.label = "Gym & Fitness Studio"
bizProfileOptions.gym_fitness.competitorNoun = "gyms"
```

## `hardware_store` (content: `retail`)

```
bizProfileOptions.hardware_store.label = "Hardware Store"
bizProfileOptions.hardware_store.competitorNoun = "hardware stores"
```

## `landscaper` (content: `trades`)

```
bizProfileOptions.landscaper.label = "Landscaping"
bizProfileOptions.landscaper.competitorNoun = "landscapers"
```

## `lawyer` (content: `lawyer`)

```
bizProfileOptions.lawyer.label = "Law Firm"
```

## `liquor_store` (content: `liquor_wine`)

```
bizProfileOptions.liquor_store.label = "Liquor & Wine Store"
bizProfileOptions.liquor_store.competitorNoun = "liquor stores"
```

## `medical_clinic` (content: `lawyer`)

```
bizProfileOptions.medical_clinic.label = "Medical / Clinic"
bizProfileOptions.medical_clinic.competitorNoun = "medical practices"
```

## `nail_salon` (content: `salon`)

```
bizProfileOptions.nail_salon.label = "Nail Salon"
bizProfileOptions.nail_salon.competitorNoun = "nail salons"
```

## `pet_services` (content: `default`)

```
bizProfileOptions.pet_services.label = "Pet Services"
bizProfileOptions.pet_services.competitorNoun = "pet-service businesses"
```

## `photographer` (content: `practitioner`)

```
bizProfileOptions.photographer.label = "Photography"
bizProfileOptions.photographer.competitorNoun = "photographers"
```

## `plumber` (content: `trades`)

```
bizProfileOptions.plumber.label = "Plumbing"
bizProfileOptions.plumber.competitorNoun = "plumbers"
```

## `real_estate` (content: `practitioner`)

```
bizProfileOptions.real_estate.label = "Real Estate"
bizProfileOptions.real_estate.competitorNoun = "real estate agencies"
```

## `retail_boutique` (content: `retail`)

```
bizProfileOptions.retail_boutique.label = "Retail / Boutique"
bizProfileOptions.retail_boutique.competitorNoun = "boutiques"
```

## `spa` (content: `salon`)

```
bizProfileOptions.spa.label = "Spa & Wellness"
bizProfileOptions.spa.competitorNoun = "spas"
```

## `tutor_education` (content: `practitioner`)

```
bizProfileOptions.tutor_education.label = "Tutoring & Education"
bizProfileOptions.tutor_education.competitorNoun = "tutoring services"
```
