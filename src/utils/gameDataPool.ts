import { PhotoTaskTemplate, QuizQuestion } from '../types/game';

// 25+ Halloween Foto-Aufgaben
export const DEFAULT_PHOTO_TASKS: PhotoTaskTemplate[] = [
  {
    id: 'pt_specific_player',
    text: 'Foto mit {playerName} ({costumeName})',
    type: 'specific_player',
  },
  {
    id: 'pt_specific_costume',
    text: 'Foto mit jemandem im Kostüm "{costumeName}"',
    type: 'specific_costume',
  },
  {
    id: 'pt_group_5',
    text: 'Gruppenfoto mit mindestens 5 Partygästen!',
    type: 'group',
    requiredCount: 5,
  },
  {
    id: 'pt_group_3',
    text: 'Gruppenfoto mit 3 Leuten, die alle gruselig in die Kamera schreien!',
    type: 'group',
    requiredCount: 3,
  },
  {
    id: 'pt_group_4',
    text: 'Gruseliges Gruppenfoto mit 4 Gästen!',
    type: 'group',
    requiredCount: 4,
  },
  {
    id: 'pt_role_costumes_3',
    text: 'Foto mit 3 verschiedenen Grusel-Kostümen (z.B. Hexe, Zombie, Skelett)',
    type: 'role_costumes',
    targetRoleCostumes: ['Hexe', 'Zombie', 'Skelett', 'Geist', 'Vampir', 'Werwolf', 'Kürbis'],
  },
  {
    id: 'pt_garlic_drinker',
    text: 'Foto von jemandem, der an einem blutroten Drink nippt.',
    type: 'general',
  },
  {
    id: 'pt_vampire_bite',
    text: 'Foto: Ein Gast tut so, als würde er einen anderen Gast sanft in den Hals beißen!',
    type: 'general',
  },
  {
    id: 'pt_witch_cackle',
    text: 'Selfie mit der lautesten Hexe oder Zauberer der Party.',
    type: 'general',
  },
  {
    id: 'pt_zombie_walk',
    text: 'Foto von 2 Gästen im perfekten Zombie-Walk.',
    type: 'general',
  },
  {
    id: 'pt_pumpkin_smile',
    text: 'Selfie mit einer Halloween-Kürbis-Dekoration oder einem Kürbis-Kostüm.',
    type: 'general',
  },
  {
    id: 'pt_cobweb',
    text: 'Foto von dir und einem Mitspieler verfangen im Spinnennetz.',
    type: 'general',
  },
  {
    id: 'pt_monster_dance',
    text: 'Foto mitten auf der Tanzfläche beim Michael Jackson Thriller Dance.',
    type: 'general',
  },
  {
    id: 'pt_werewolf_howl',
    text: 'Foto von einem Gast, der wie ein Werwolf zum Mond heult.',
    type: 'general',
  },
  {
    id: 'pt_ghost_face',
    text: 'Foto: Grimassen-Duell! Wer macht das furchterregendste Geistergesicht?',
    type: 'general',
  },
  {
    id: 'pt_best_makeup',
    text: 'Nahaufnahme von der detailreichsten Grusel-Schminke des Abends.',
    type: 'general',
  },
  {
    id: 'pt_duo_cheers',
    text: 'Foto beim Anstoßen mit einem Gast, dessen Namen du noch nicht kanntest.',
    type: 'general',
  },
  {
    id: 'pt_coffin_pose',
    text: 'Foto in entspannter Vampir-Sarg-Pose auf einer Couch oder Bank.',
    type: 'general',
  },
  {
    id: 'pt_candy_thief',
    text: 'Schnappschuss von jemandem, der heimlich Halloween-Süßigkeiten nascht.',
    type: 'general',
  },
  {
    id: 'pt_bloody_hand',
    text: 'Foto mit zwei Händen, die gruselig nach der Kamera greifen.',
    type: 'general',
  },
  {
    id: 'pt_bat_wings',
    text: 'Foto mit ausgebreiteten Fledermaus-Armen mit mindestens 2 Gästen.',
    type: 'general',
  },
  {
    id: 'pt_scary_duo',
    text: 'Ein schrecklich schönes Paar-Foto mit einem beliebigen Gast.',
    type: 'general',
  },
  {
    id: 'pt_shadow_play',
    text: 'Foto mit einem geheimnisvollen Schattenwurf an der Wand.',
    type: 'general',
  },
  {
    id: 'pt_creepy_laugh',
    text: 'Foto von 3 Gästen, die ein teuflisches Lachen inszenieren.',
    type: 'general',
  },
  {
    id: 'pt_party_legend',
    text: 'Foto mit dem Party-Gast, der heute die beste Stimmung verbreitet!',
    type: 'general',
  },
  {
    id: 'pt_spider_pose',
    text: 'Foto: Jemand krabbelt wie eine Riesenspinne über den Boden.',
    type: 'general',
  },
  {
    id: 'pt_dracula_cape',
    text: 'Foto mit jemandem, der einen Umhang oder Cape trägt.',
    type: 'general',
  },
];

// 30 Halloween Quizfragen
export const DEFAULT_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    question: 'Aus welchem Land stammt der ursprüngliche Brauch von Halloween ("Samhain")?',
    options: ['Irland', 'USA', 'Deutschland', 'Mexiko'],
    correctIndex: 0,
    explanation: 'Halloween geht auf das keltische Fest Samhain im alten Irland zurück.',
  },
  {
    id: 'q2',
    question: 'Welches Gemüse wurde in Irland ursprünglich für Halloween-Laternen geschnitzt?',
    options: ['Rüben / Steckrüben', 'Kürbisse', 'Kartoffeln', 'Melonen'],
    correctIndex: 0,
    explanation: 'Erst in den USA entdeckten irische Einwanderer den leichter zu schnitzenden Kürbis.',
  },
  {
    id: 'q3',
    question: 'Wie heißt der legendäre Geizkragen, nach dem die geschnitzte Kürbislaterne benannt ist?',
    options: ['Jack O\'Lantern', 'Dracula Jack', 'John Doe', 'Jack Skellington'],
    correctIndex: 0,
    explanation: 'Die Laterne geht auf die irische Sage vom Hufschmied Jack Oldfield zurück.',
  },
  {
    id: 'q4',
    question: 'Wann soll sich der Legende nach ein Mensch in einen Werwolf verwandeln?',
    options: ['Bei Vollmond', 'Bei Neumond', 'Bei Sonnenfinsternis', 'Um Punkt 12 Uhr mittags'],
    correctIndex: 0,
    explanation: 'Der Vollmond löst nach europäischer Sage die Verwandlung aus.',
  },
  {
    id: 'q5',
    question: 'Welches Metall ist der klassische Schwachpunkt von Werwölfen?',
    options: ['Silber', 'Gold', 'Bronze', 'Kupfer'],
    correctIndex: 0,
    explanation: 'Silberkugeln gelten als einziges wirksames Mittel gegen Werwölfe.',
  },
  {
    id: 'q6',
    question: 'Welches Gewächs soll Vampire laut Volksglauben zuverlässig vertreiben?',
    options: ['Knoblauch', 'Petersilie', 'Zwiebeln', 'Basilikum'],
    correctIndex: 0,
    explanation: 'Knoblauch wird schon seit Jahrhunderten gegen Dämonen und Blutsauger eingesetzt.',
  },
  {
    id: 'q7',
    question: 'Welches Holz wird traditionell für den Pflock verwendet, um Vampire zu stoppen?',
    options: ['Eschen- oder Weißdornholz', 'Bambus', 'Korkholz', 'Birkenrinde'],
    correctIndex: 0,
    explanation: 'Esche, Weißdorn und Eiche galten im Volksglauben als heilige, wehrhafte Hölzer.',
  },
  {
    id: 'q8',
    question: 'Wie lautet der berühmte Titel des Halloween-Kultsongs von Michael Jackson?',
    options: ['Thriller', 'Bad', 'Monster Mash', 'Ghostbusters'],
    correctIndex: 0,
    explanation: '"Thriller" erschien 1982 und hat eines der berühmtesten Grusel-Musikvideos.',
  },
  {
    id: 'q9',
    question: 'Welche Farbe hat das Fruchtfleisch des bekannten Hokkaido-Kürbisses?',
    options: ['Kräftiges Orange', 'Tiefes Blau', 'Schneeweiß', 'Dunkelgrün'],
    correctIndex: 0,
    explanation: 'Hokkaido zeichnet sich durch seine essbare Schale und orangefarbenes Fleisch aus.',
  },
  {
    id: 'q10',
    question: 'Wie nennt man die Angst vor Halloween in der Psychologie?',
    options: ['Samhainophobie', 'Kürbophobie', 'Draculaphobie', 'Spookophobie'],
    correctIndex: 0,
    explanation: 'Samhainophobie leitet sich direkt vom keltischen Ursprungsfest Samhain ab.',
  },
  {
    id: 'q11',
    question: 'Aus welcher historischen Region stammte Graf Dracula im Roman von Bram Stoker?',
    options: ['Transsilvanien', 'Bayern', 'Sizilien', 'Schottland'],
    correctIndex: 0,
    explanation: 'Bram Stokers Meisterwerk spielt zu großen Teilen im nebligen Transsilvanien.',
  },
  {
    id: 'q12',
    question: 'Welches historische Vorbild diente Bram Stoker vermutlich für Dracula?',
    options: ['Vlad III. der Pfähler', 'Kaiser Nero', 'König Artus', 'Robin Hood'],
    correctIndex: 0,
    explanation: 'Vlad Tepes, auch als Draculea bekannt, herrschte im 15. Jahrhundert über die Walachei.',
  },
  {
    id: 'q13',
    question: 'Was rufen Kinder in den USA, wenn sie an Halloween an Haustüren klopfen?',
    options: ['Trick or Treat', 'Happy Birthday', 'Give me Candy', 'Open the Door'],
    correctIndex: 0,
    explanation: '"Trick or Treat" bedeutet so viel wie "Süßes oder Saures".',
  },
  {
    id: 'q14',
    question: 'In welchem mexikanischen Feiertag werden die Toten mit bunten Altären gefeiert?',
    options: ['Día de los Muertos', 'Cinco de Mayo', 'Carnaval', 'Semana Santa'],
    correctIndex: 0,
    explanation: 'Der Tag der Toten wird vom 31. Oktober bis 2. November farbenfroh gefeiert.',
  },
  {
    id: 'q15',
    question: 'Welches Tier wird im Volksglauben traditionell Hexen als Gefährte zugeschrieben?',
    options: ['Schwarze Katze', 'Gelbe Ente', 'Rosa Schwein', 'Goldfisch'],
    correctIndex: 0,
    explanation: 'Schwarze Katzen galten im Mittelalter abergläubisch als Gehilfen von Hexen.',
  },
  {
    id: 'q16',
    question: 'Wie heißt die Tochter der Gruselfamilie Addams Family mit den Zöpfen?',
    options: ['Wednesday', 'Sunday', 'Friday', 'Summer'],
    correctIndex: 0,
    explanation: 'Wednesday Addams ist bekannt für ihre geflochtenen Zöpfe und dunklen Humor.',
  },
  {
    id: 'q17',
    question: 'Aus welchem Roman von Mary Shelley stammt das künstlich erschaffene Wesen von Dr. Frankenstein?',
    options: ['Frankenstein', 'Dracula', 'Das Bildnis des Dorian Gray', 'Dr. Jekyll & Mr. Hyde'],
    correctIndex: 0,
    explanation: 'Mary Shelley schrieb das Werk 1818 im Alter von nur 20 Jahren.',
  },
  {
    id: 'q18',
    question: 'Welches Symbol auf einem Grabstein oder Piratenschiff steht weltweit für Gefahr und Tod?',
    options: ['Totenkopf mit gekreuzten Knochen', 'Anker', 'Sternschnuppe', 'Hufeisen'],
    correctIndex: 0,
    explanation: 'Der "Jolly Roger" war das gefürchtete Erkennungszeichen auf den Meeren.',
  },
  {
    id: 'q19',
    question: 'Welches Tier verwandelt sich der Vampir der Legende nach am liebsten, um lautlos zu fliegen?',
    options: ['Fledermaus', 'Taube', 'Adler', 'Flamingo'],
    correctIndex: 0,
    explanation: 'Fledermäuse und Nebel sind die klassischen Tarnungen des Vampirs.',
  },
  {
    id: 'q20',
    question: 'In welcher US-Stadt fand 1692 eine der berüchtigtsten Hexenverfolgungen statt?',
    options: ['Salem', 'New York', 'Las Vegas', 'Miami'],
    correctIndex: 0,
    explanation: 'Die Hexenprozesse von Salem in Massachusetts sind bis heute weltbekannt.',
  },
  {
    id: 'q21',
    question: 'Welcher Feiertag folgt im christlichen Kalender direkt auf Halloween (1. November)?',
    options: ['Allerheiligen', 'Allerseelen', 'Ostern', 'Pfingsten'],
    correctIndex: 0,
    explanation: 'Halloween leitet sich ab von "All Hallows\' Eve", dem Vorabend von Allerheiligen.',
  },
  {
    id: 'q22',
    question: 'Welches Ritual-Spielzeug besteht aus einem Holzbrett mit Buchstaben und einer Planchette?',
    options: ['Ouija-Brett', 'Monopoly', 'Schach', 'Scrabble'],
    correctIndex: 0,
    explanation: 'Das Ouija-Brett wird in vielen Gruselgeschichten genutzt, um mit Geistern zu sprechen.',
  },
  {
    id: 'q23',
    question: 'Wie viele Beine hat eine Spinne normalerweise?',
    options: ['8', '6', '10', '12'],
    correctIndex: 0,
    explanation: 'Spinnentiere (Arachnida) besitzen im Unterschied zu Insekten 8 Laufbeine.',
  },
  {
    id: 'q24',
    question: 'Welche Farbe hat das Blut von Insekten und manchen Krustentieren oft statt Rot?',
    options: ['Blau oder Grün/Farblos', 'Giftgelb', 'Schwarz', 'Gold'],
    correctIndex: 0,
    explanation: 'Hämocyanin mit Kupfer lässt das Blut mancher Tiere bläulich schimmern.',
  },
  {
    id: 'q25',
    question: 'Welcher Tim Burton Animationsfilm spielt in Halloween Town?',
    options: ['The Nightmare Before Christmas', 'Toy Story', 'Shrek', 'Findet Nemo'],
    correctIndex: 0,
    explanation: 'Kürbiskönig Jack Skellington regiert Halloween Town im Stop-Motion-Klassiker.',
  },
  {
    id: 'q26',
    question: 'Welcher fiktive Horror-Bösewicht trägt einen Handschuh mit rasiermesserscharfen Klingen?',
    options: ['Freddy Krueger', 'Jason Voorhees', 'Michael Myers', 'Pennywise'],
    correctIndex: 0,
    explanation: 'Freddy Krueger terrorisiert Albträume in "A Nightmare on Elm Street".',
  },
  {
    id: 'q27',
    question: 'Welches bekannte Gewürz wird im "Pumpkin Spice" neben Zimt und Nelken typischerweise verwendet?',
    options: ['Muskatnuss & Ingwer', 'Paprika & Knoblauch', 'Kümmel & Dill', 'Oregano & Thymian'],
    correctIndex: 0,
    explanation: 'Pumpkin Spice besteht aus Zimt, Muskatnuss, Ingwer, Nelken und Piment.',
  },
  {
    id: 'q28',
    question: 'Welche Maske trägt Michael Myers in der Filmreihe "Halloween"?',
    options: ['Eine weiße William-Shatner-Maske', 'Eine Eishockeymaske', 'Eine Clownsmaske', 'Eine Wolfsmaske'],
    correctIndex: 0,
    explanation: 'Die Originalmaske war eine modifizierte Captain-Kirk-Maske von William Shatner.',
  },
  {
    id: 'q29',
    question: 'Warum spiegeln sich Vampire der Legende nach nicht im Spiegel?',
    options: ['Weil alte Spiegel mit Silber beschichtet waren und sie keine Seele haben', 'Weil sie unsichtbar sind', 'Weil Spiegel sie blenden', 'Weil Glas brennt'],
    correctIndex: 0,
    explanation: 'Silber galt als reines, heiliges Metall, das das Böse nicht reflektieren konnte.',
  },
  {
    id: 'q30',
    question: 'Welche berühmte Romanfigur wurde durch Blitzschlag auf einem Friedhof zum Leben erweckt?',
    options: ['Frankensteins Monster', 'Gollum', 'Quasimodo', 'Pinocchio'],
    correctIndex: 0,
    explanation: 'Dr. Frankenstein nutzte elektrische Energie und Blitzableiter für seine Schöpfung.',
  },
];

// 40 Halloween Anagramm-Wörter
export const HALLOWEEN_ANAGRAMS = [
  { word: 'SKELETT', hint: 'Klapperndes Knochengestell' },
  { word: 'VAMPIR', hint: 'Blutsauger der Nacht' },
  { word: 'WERWOLF', hint: 'Heult den Vollmond an' },
  { word: 'KÜRBIS', hint: 'Orange Herbstfrucht mit Fratze' },
  { word: 'FLEDERMAUS', hint: 'Fliegt lautlos im Dunkeln' },
  { word: 'TOTENKOPF', hint: 'Klassisches Piraten- & Giftsymbol' },
  { word: 'SPINNE', hint: 'Acht Beine im Netz' },
  { word: 'GEISTERHAUS', hint: 'Altes Gebäude voller Spuk' },
  { word: 'HEXENKREIS', hint: 'Magischer Zirkel' },
  { word: 'ZOMBIE', hint: 'Untoter Wandler' },
  { word: 'GRUSELIG', hint: 'Echtes Gänsehaut-Gefühl' },
  { word: 'VOLLMOND', hint: 'Erhellt die finstere Nacht' },
  { word: 'EXORZISMUS', hint: 'Geisteraustreibung' },
  { word: 'FRIEDHOF', hint: 'Ruhestätte unter Zypressen' },
  { word: 'SARGFEE', hint: 'Mythische Gestalt des Grabes' },
  { word: 'KNOCHEN', hint: 'Bestandteil des Skeletts' },
  { word: 'SPINNWEBEN', hint: 'Klebrige Fäden in dunklen Ecken' },
  { word: 'MITTERNACHT', hint: 'Die Geisterstunde schlägt 12' },
  { word: 'BLUTDURST', hint: 'Heißhunger der Vampire' },
  { word: 'SCHATTEN', hint: 'Folgt dir auf Schritt und Tritt' },
  { word: 'DUNKELHEIT', hint: 'Wenn alles Licht erlischt' },
  { word: 'SCHRECKEN', hint: 'Plötzliche Panik im Dunkeln' },
  { word: 'PHANTOM', hint: 'Geisterhafte Erscheinung' },
  { word: 'DRAKULA', hint: 'Berühmtester Graf aller Zeiten' },
  { word: 'KOPFLOS', hint: 'Reiter ohne Haupt' },
  { word: 'ALPTRAUM', hint: 'Böser Traum in der Nacht' },
  { word: 'MONSTER', hint: 'Gruseliges Ungeheuer' },
  { word: 'MUMIE', hint: 'In Leinenbinden gewickelt' },
  { word: 'SCHREI', hint: 'Lauter Hilferuf in der Dunkelheit' },
  { word: 'KETTENSÄGE', hint: 'Lautes Werkzeug aus Horrorfilmen' },
  { word: 'KERZENSCHEIN', hint: 'Flackerndes warmes Licht' },
  { word: 'KAPUZE', hint: 'Dunkle Kopfbedeckung der Gestalten' },
  { word: 'FLUCH', hint: 'Böse Verwünschung' },
  { word: 'DÄMON', hint: 'Wesen der Finsternis' },
  { word: 'SPUK', hint: 'Unheimliches Treiben im Schloss' },
  { word: 'GIFTBECHER', hint: 'Gefährlicher Trank' },
  { word: 'GRABSTEIN', hint: 'Steinerne Inschrift' },
  { word: 'LABYRINTH', hint: 'Verwirrspiel aus Hecken' },
  { word: 'MYSTERIUM', hint: 'Ungelöstes Geheimnis' },
  { word: 'HALLOWEEN', hint: 'Das Fest des 31. Oktober' },
];

export const SEQUENCE_SYMBOLS = ['🎃', '👻', '🦇', '💀', '🕷️'];

export function generateScrambledWord(word: string): string {
  const letters = word.split('');
  let scrambled = '';
  // Fisher-Yates shuffle until different
  let attempts = 0;
  do {
    const arr = [...letters];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    scrambled = arr.join('');
    attempts++;
  } while (scrambled === word && attempts < 20);
  return scrambled;
}

export function generateMathQuestions(): { expression: string; answer: number }[] {
  const generators = [
    // 1: Multiplikation mittlerer Schwierigkeit
    () => {
      const a = Math.floor(Math.random() * 9) + 12; // 12-20
      const b = Math.floor(Math.random() * 6) + 4;  // 4-9
      return { expression: `${a} × ${b}`, answer: a * b };
    },
    // 2: Division + Addition
    () => {
      const div = Math.floor(Math.random() * 5) + 3; // 3-7
      const quotient = Math.floor(Math.random() * 15) + 10; // 10-24
      const dividend = div * quotient;
      const add = Math.floor(Math.random() * 25) + 11; // 11-35
      return { expression: `${dividend} ÷ ${div} + ${add}`, answer: quotient + add };
    },
    // 3: Dreistellige Subtraktion
    () => {
      const x = Math.floor(Math.random() * 120) + 110; // 110-229
      const y = Math.floor(Math.random() * 50) + 35;   // 35-84
      return { expression: `${x} − ${y}`, answer: x - y };
    },
  ];

  return generators.map((g) => g());
}

export function generateSequence(length = 5): string[] {
  const seq: string[] = [];
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * SEQUENCE_SYMBOLS.length);
    seq.push(SEQUENCE_SYMBOLS[randomIndex]);
  }
  return seq;
}

export function generateSecretCode(digits = 4): string {
  let code = '';
  for (let i = 0; i < digits; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

