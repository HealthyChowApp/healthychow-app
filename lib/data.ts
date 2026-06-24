// Mock data for the Healthy Chow MVP (Milestone 1).
// Replaced by live Google Places + nutrition data in later milestones.

export type DietId = "keto" | "low-carb" | "mediterranean" | "paleo" | "carnivore";
export type StyleId = "dine-in" | "take-out" | "fast-casual" | "fast-food";
export type Fit = "strong" | "good" | "weak";

export interface Diet {
  id: DietId;
  ic: string;
  t: string;
  d: string;
  color: string;
}

export interface Style {
  id: StyleId;
  ic: string;
  t: string;
  d: string;
}

export interface Rec {
  item: string;
  mods: { rm: string[]; add: string[] };
  why: string;
  carbs: number;
  sugar: number;
  protein: number;
  fit: Fit;
  price: number;
}

export interface Restaurant {
  name: string;
  style: StyleId;
  tag: string;
  dist: string;
  independent: boolean;
  recs: Partial<Record<DietId, Rec>>;
}

export const DIETS: Diet[] = [
  { id: "keto", ic: "🥑", t: "Keto", d: "High fat, very low carb", color: "#7A4FA0" },
  { id: "low-carb", ic: "🥬", t: "Low-Carb", d: "Cut starch, keep protein and veg", color: "#E07A3E" },
  { id: "mediterranean", ic: "🐟", t: "Mediterranean", d: "Fish, olive oil, veg, whole grains", color: "#2F7DA3" },
  { id: "paleo", ic: "🍗", t: "Paleo", d: "Whole foods, no grains or dairy", color: "#9C5B33" },
  { id: "carnivore", ic: "🥩", t: "Carnivore", d: "Animal foods only", color: "#B0413E" },
];

export const STYLES: Style[] = [
  { id: "dine-in", ic: "🍷", t: "Dine-in", d: "Sit-down restaurants" },
  { id: "take-out", ic: "🥡", t: "Take-out", d: "Order and go" },
  { id: "fast-casual", ic: "🥙", t: "Fast-casual", d: "Chipotle, Sweetgreen, and the like" },
  { id: "fast-food", ic: "🍔", t: "Fast food", d: "Drive-thru chains" },
];

export const AVOID = ["Gluten", "Dairy", "Nuts", "Shellfish", "Soy", "Pork", "Eggs", "Cilantro"];

export const dietColor = (id: DietId | null) => DIETS.find((d) => d.id === id)?.color ?? "#1E4F2B";
export const dietName = (id: DietId | null) => DIETS.find((d) => d.id === id)?.t ?? "";

export const RESTAURANTS: Restaurant[] = [
  {
    name: "McDonald's", style: "fast-food", tag: "Fast Food", dist: "0.8 mi", independent: false,
    recs: {
      keto: { item: "Double Quarter Pounder, patty only", mods: { rm: ["No bun", "No ketchup"], add: ["Add cheese", "Side of bacon"] }, why: "The bun (~40g carbs) and ketchup (added sugar) are the only off-plan parts. Patty plus cheese is nearly zero carb.", carbs: 3, sugar: 0, protein: 30, fit: "strong", price: 7.49 },
      "low-carb": { item: "Double Quarter Pounder", mods: { rm: ["Open-face, top bun only", "No ketchup"], add: ["Extra patty"] }, why: "Dropping half the bun and the ketchup roughly halves the carbs while keeping it filling.", carbs: 19, sugar: 4, protein: 32, fit: "good", price: 7.49 },
      carnivore: { item: "Double Quarter Pounder, patty only", mods: { rm: ["No bun", "No ketchup", "No pickles", "No onion"], add: ["Add 2 sausage patties"] }, why: "Beef and cheese only. Strip everything plant-based and you have a clean carnivore plate.", carbs: 1, sugar: 0, protein: 46, fit: "strong", price: 9.29 },
      paleo: { item: "Grilled chicken, no bun", mods: { rm: ["No bun", "No mayo", "No cheese"], add: ["Side salad"] }, why: "Grilled chicken works, but dairy and the seed-oil mayo are off-plan. Lean protein plus a side salad is the best fit here.", carbs: 8, sugar: 3, protein: 28, fit: "good", price: 6.99 },
    },
  },
  {
    name: "Chipotle", style: "fast-casual", tag: "Fast Casual", dist: "1.2 mi", independent: false,
    recs: {
      keto: { item: "Burrito Bowl", mods: { rm: ["No rice", "No beans"], add: ["Double chicken", "Cheese", "Guacamole", "Fajita veg"] }, why: "Rice and beans are the carbs. Load protein, cheese, and guac instead, a classic keto bowl under 10g net carbs.", carbs: 9, sugar: 2, protein: 52, fit: "strong", price: 11.45 },
      "low-carb": { item: "Burrito Bowl", mods: { rm: ["No rice"], add: ["Chicken", "Black beans (½)", "Salsa", "Lettuce"] }, why: "Keep a half-portion of beans for fiber, skip the rice. Balanced and well within low-carb.", carbs: 24, sugar: 3, protein: 44, fit: "strong", price: 11.45 },
      mediterranean: { item: "Veggie Bowl", mods: { rm: ["No cheese", "No sour cream"], add: ["Brown rice", "Black beans", "Fajita veg", "Guac"] }, why: "Plant-forward with healthy fats from guac. Skipping dairy keeps it closer to Mediterranean.", carbs: 48, sugar: 4, protein: 16, fit: "good", price: 9.95 },
      paleo: { item: "Salad Bowl", mods: { rm: ["No rice", "No beans", "No cheese", "No dressing"], add: ["Carnitas", "Guac", "Fajita veg", "Romaine"] }, why: "Meat, veg, and guac only, no grains, legumes, or dairy. About as paleo as a chain gets.", carbs: 11, sugar: 3, protein: 34, fit: "strong", price: 12.20 },
      carnivore: { item: "Double Steak, meat only", mods: { rm: ["No bowl base", "No veg", "No salsa"], add: ["Triple steak", "Extra cheese"] }, why: "Order steak by the scoop. Not their specialty, but a meat-and-cheese portion is doable.", carbs: 2, sugar: 0, protein: 48, fit: "good", price: 13.50 },
    },
  },
  {
    name: "Sal's Corner Deli", style: "take-out", tag: "Local • Take-out", dist: "0.4 mi", independent: true,
    recs: {
      keto: { item: "Chef Salad", mods: { rm: ["No croutons", "No shredded carrot"], add: ["Ranch dressing", "Extra turkey & ham", "Avocado"] }, why: "Croutons and carrots are the hidden carbs. Swap the sweet vinaigrette for cream-based ranch and add fat.", carbs: 8, sugar: 3, protein: 29, fit: "good", price: 10.50 },
      "low-carb": { item: "Italian Cobb Salad", mods: { rm: ["No croutons"], add: ["Olive oil & vinegar", "Extra egg"] }, why: "A loaded cobb is naturally low-carb once the croutons are gone. Oil and vinegar keeps sugar down.", carbs: 12, sugar: 4, protein: 26, fit: "good", price: 9.75 },
      mediterranean: { item: "Greek Salad with Grilled Chicken", mods: { rm: ["Light feta"], add: ["Extra olives", "Olive oil", "Lemon"] }, why: "Greens, olives, olive oil, and lean chicken. This is the Mediterranean template. Just go easy on the feta.", carbs: 14, sugar: 6, protein: 31, fit: "strong", price: 11.00 },
      paleo: { item: "Grilled Chicken Salad", mods: { rm: ["No croutons", "No cheese"], add: ["Olive oil & vinegar", "Avocado"] }, why: "Chicken, greens, and avocado with no grains or dairy. Skip the deli cheese and the creamy dressings.", carbs: 10, sugar: 3, protein: 30, fit: "good", price: 10.25 },
    },
  },
  {
    name: "The Anchor Tavern", style: "dine-in", tag: "Dine-in • Seafood", dist: "1.9 mi", independent: true,
    recs: {
      mediterranean: { item: "Grilled Branzino", mods: { rm: ["Hold the bread"], add: ["Double sautéed spinach", "Lemon & olive oil"] }, why: "Whole grilled fish with greens in olive oil is the gold standard for Mediterranean. Outstanding fit.", carbs: 9, sugar: 2, protein: 42, fit: "strong", price: 23.00 },
      keto: { item: "Ribeye Steak", mods: { rm: ["No potato"], add: ["Sub asparagus", "Garlic butter", "Side Caesar, no croutons"] }, why: "Steak plus green veg plus butter is textbook keto. Swap the starch side and lose the croutons.", carbs: 6, sugar: 1, protein: 48, fit: "strong", price: 26.50 },
      carnivore: { item: "16oz Ribeye", mods: { rm: ["No sides", "No sauce"], add: ["Add shrimp skewer", "Butter"] }, why: "Just the steak, add seafood for variety. The cleanest carnivore plate on this list.", carbs: 0, sugar: 0, protein: 62, fit: "strong", price: 28.00 },
      paleo: { item: "Pan-Seared Salmon", mods: { rm: ["No butter", "No potato"], add: ["Roasted vegetables", "Olive oil"] }, why: "Wild fish and roasted veg with no dairy or grains. Ask for olive oil instead of butter to keep it paleo.", carbs: 12, sugar: 4, protein: 38, fit: "good", price: 24.00 },
    },
  },
  {
    name: "Sweetgreen", style: "fast-casual", tag: "Fast Casual", dist: "2.3 mi", independent: false,
    recs: {
      mediterranean: { item: "Shroomami Bowl", mods: { rm: ["Light tahini"], add: ["Warm quinoa", "Roasted almonds"] }, why: "Whole grains, veg, and a tahini-based dressing line up well with Mediterranean eating.", carbs: 46, sugar: 8, protein: 18, fit: "good", price: 13.25 },
      keto: { item: "Custom 'Keto' Plate", mods: { rm: ["No grains", "No sweet potato"], add: ["Blackened chicken", "Avocado", "Goat cheese", "Caesar dressing"] }, why: "Build your own: protein, avocado, cheese, leafy greens. Skip every grain and root vegetable.", carbs: 11, sugar: 4, protein: 34, fit: "good", price: 14.50 },
      "low-carb": { item: "Harvest Bowl", mods: { rm: ["No wild rice", "½ sweet potato"], add: ["Extra chicken"] }, why: "Cutting the rice and halving the sweet potato brings this popular bowl into low-carb range.", carbs: 28, sugar: 7, protein: 30, fit: "good", price: 13.95 },
      paleo: { item: "Custom Paleo Plate", mods: { rm: ["No grains", "No cheese"], add: ["Steak", "Avocado", "Roasted veg", "Olive oil"] }, why: "Meat, veg, and avocado with olive oil, no dairy or grains. Easy to assemble here.", carbs: 14, sugar: 5, protein: 32, fit: "strong", price: 15.00 },
    },
  },
  {
    name: "Wendy's", style: "fast-food", tag: "Fast Food", dist: "1.5 mi", independent: false,
    recs: {
      keto: { item: "Baconator, no bun", mods: { rm: ["No bun", "No ketchup"], add: ["Extra cheese"] }, why: "Two patties, bacon, and cheese with the bun and ketchup removed is one of the best fast-food keto orders anywhere.", carbs: 4, sugar: 1, protein: 58, fit: "strong", price: 8.49 },
      "low-carb": { item: "Grilled Chicken Sandwich", mods: { rm: ["Top bun only", "No honey mustard"], add: ["Extra lettuce & tomato"] }, why: "Grilled (not breaded) chicken, open-faced, with a sugar-free sauce keeps carbs modest.", carbs: 21, sugar: 5, protein: 35, fit: "good", price: 7.29 },
      carnivore: { item: "Triple Baconator, patties only", mods: { rm: ["No bun", "No veg", "No sauce"], add: ["Extra bacon", "Extra cheese"] }, why: "Pure beef, bacon, and cheese. Strip the bun and condiments for a zero-carb carnivore order.", carbs: 2, sugar: 0, protein: 70, fit: "strong", price: 10.99 },
    },
  },
];
