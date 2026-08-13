export const WORD_BANK = [
  // Animals
  "dog", "cat", "fish", "bird", "rabbit", "horse", "elephant", "lion",
  "tiger", "monkey", "frog", "duck", "cow", "sheep", "bee", "butterfly",
  "spider", "snake", "shark", "whale", "owl", "penguin", "kangaroo",
  "koala", "panda", "zebra", "giraffe", "hippo", "crocodile", "turtle",
  "octopus", "crab", "seahorse", "dolphin", "squirrel", "hedgehog",
  "bat", "chicken", "rooster", "pig", "goat", "donkey", "camel",
  "peacock", "flamingo", "parrot", "eagle", "swan", "snail", "ladybug",
  "ant", "worm", "mouse", "fox", "wolf", "bear", "deer", "raccoon",
  "otter", "seal", "walrus", "jellyfish", "lobster", "starfish",
  "chameleon", "lizard", "scorpion",

  // Food & drink
  "apple", "banana", "pizza", "cake", "ice cream", "cookie", "egg",
  "watermelon", "carrot", "sandwich", "orange", "strawberry", "grapes",
  "pineapple", "corn", "broccoli", "mushroom", "cheese", "bread",
  "doughnut", "cupcake", "popcorn", "pretzel", "taco", "burger",
  "hot dog", "spaghetti", "sushi", "pancake", "waffle", "lollipop",
  "candy cane", "milkshake", "lemonade", "honey", "peanut", "avocado",
  "pumpkin", "chili pepper", "onion", "pineapple slice", "cherry",
  "coconut", "cupcake with sprinkles", "birthday cake", "chocolate bar",

  // Nature & weather
  "sun", "moon", "star", "cloud", "rainbow", "tree", "flower", "mountain",
  "beach", "snowman", "volcano", "waterfall", "river", "lake", "island",
  "cactus", "forest", "lightning", "tornado", "snowflake", "leaf",
  "seashell", "wave", "campfire", "desert", "iceberg", "puddle",
  "sunflower", "mushroom cloud", "shooting star", "rain cloud",

  // Vehicles & transport
  "house", "car", "boat", "airplane", "bicycle", "train", "rocket",
  "umbrella", "balloon", "kite", "submarine", "helicopter", "bus",
  "truck", "motorcycle", "skateboard", "scooter", "hot air balloon",
  "sailboat", "tractor", "canoe", "spaceship", "wheelbarrow",

  // Everyday objects
  "ball", "book", "chair", "table", "clock", "hat", "shoe", "glasses",
  "guitar", "camera", "key", "lamp", "mirror", "pencil", "scissors",
  "backpack", "suitcase", "envelope", "candle", "ladder", "broom",
  "toothbrush", "bathtub", "pillow", "blanket", "telephone", "television",
  "computer keyboard", "headphones", "flashlight", "magnifying glass",
  "paintbrush", "hammer", "wrench", "compass", "map", "treasure chest",
  "piggy bank", "birthday present", "trophy", "medal", "crown",

  // Fantasy & costume
  "robot", "dragon", "castle", "pirate", "ghost", "unicorn", "dinosaur",
  "wizard", "mermaid", "superhero", "alien", "monster", "vampire",
  "zombie", "fairy", "knight", "witch", "genie", "yeti", "troll",
  "ninja", "astronaut", "mummy", "werewolf", "elf", "giant",

  // Sports & activities
  "soccer ball", "basketball", "tennis racket", "swimming pool",
  "surfboard", "roller skates", "trampoline", "fishing rod",
  "baseball bat", "golf club", "skis", "snowboard", "boxing gloves",
  "yoga mat", "jump rope",

  // Jobs & people
  "firefighter", "police officer", "doctor", "teacher", "chef",
  "farmer", "artist", "clown", "detective", "scientist", "astronaut helmet",
  "king", "queen", "princess", "musician", "dancer",

  // Places
  "school", "library", "hospital", "farm", "zoo", "playground",
  "supermarket", "restaurant", "church", "lighthouse", "bridge",
  "tent", "igloo", "windmill", "treehouse", "barn",

  // Clothing
  "sweater", "raincoat", "mittens", "scarf", "boots", "necktie",
  "sunglasses", "bowtie", "backpack straps", "wedding dress",

  // Instruments & tech
  "piano", "drum", "trumpet", "violin", "microphone", "video game controller",
  "robot arm", "satellite", "traffic light", "vending machine",

  // Actions (fun to draw as poses/scenes)
  "sleeping", "dancing", "swimming", "climbing", "jumping", "flying",
  "singing", "laughing", "crying", "running", "skating", "diving",
  "juggling", "sneezing", "yawning", "hiding", "fishing", "camping",
  "painting a picture", "riding a bike", "flying a kite", "building a sandcastle",
] as const;

export function pickRandomWord(exclude: ReadonlySet<string> = new Set()): string {
  const pool = WORD_BANK.filter((w) => !exclude.has(w));
  const source = pool.length > 0 ? pool : WORD_BANK;
  return source[Math.floor(Math.random() * source.length)];
}
