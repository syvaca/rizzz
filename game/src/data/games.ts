import { AnimalFinderGame } from '../scenes/games/animalFinder/AnimalFinderGame';
import { CosmoClimbScene } from '../scenes/games/cosmoClimb/CosmoClimb';
import { FloatFrenzy } from '../scenes/games/floatFrenzy/FloatFrenzy';
import { QuickTapPoker } from '../scenes/games/quickTapPoker/QuickTapPoker';
import { BoulderBashScene } from '../scenes/games/boulderBash/BoulderBash';
import { GemHuntGame } from '../scenes/games/gemHunt/gemHunt';
import { QuickTapWords } from '../scenes/games/quickTapWords/QuickTapWords';
import { QuickTapNumbers } from '../scenes/games/quickTapNumbers/QuickTapNumbers';

export interface GameData {
  id: string;
  name: string;
  description: string;
  photo: string; // Path to game thumbnail
  mapPosition: { x: number; y: number }; // Position on the map
  sceneClass: any; // Reference to the game's scene class
}

export const GAMES: GameData[] = [
  {
    id: 'cosmo-climb',
    name: 'Cosmo Climb',
    description: 'Climb up the plaforms through space, avoid monsters and collect powerups',
    photo: '/assets/game-thumbnails/cosmoClimbIcon.png',
    mapPosition: { x: 706, y: 250 },
    sceneClass: CosmoClimbScene
  },
  {
    id: 'animal-finder', 
    name: 'Animal Finder',
    description: 'Find the wanted animals on the screen',
    photo: '/assets/game-thumbnails/animalFinderIcon.png',
    mapPosition: { x: 498, y: 766 },
    sceneClass: AnimalFinderGame
  },
  {
    id: 'float-frenzy',
    name: 'Float Frenzy',
    description: 'Float through the ocean, avoid bombs and collect powerups',
    photo: '/assets/game-thumbnails/floatFrenzyIcon.png',
    mapPosition: { x: 241, y: 709 }, // edit to be where you want it on the map
    sceneClass: FloatFrenzy
  },
  {
    id: 'quick-tap-poker',
    name: 'Quick Tap Poker',
    description: 'Tap 5 cards in 5 seconds to make the best poker hand!',
    photo: '/assets/game-thumbnails/quickTapPokerIcon.png',
    mapPosition: { x: 230, y: 281 }, // Position in middle of map
    sceneClass: QuickTapPoker
  },
  {
    id: 'quick-tap-words',
    name: 'Quick Tap Words',
    description: 'Form the longest valid word in 15 seconds using letter tiles.',
    photo: '/assets/game-thumbnails/quickTapWordsIcon.png',
    mapPosition: { x: 200, y: 500 },
    sceneClass: QuickTapWords
  },
  {
    id: 'quick-tap-numbers',
    name: 'Quick Tap Numbers',
    description: 'Use + - * / to reach the target before time runs out.',
    photo: '/assets/game-thumbnails/quickTapNumbersIcon.png',
    mapPosition: { x: 500, y: 320 },
    sceneClass: QuickTapNumbers
  },
  {
    id: 'boulder-bash',
    name: 'Boulder Bash',
    description: 'Destroy the boulders before they hit you!',
    photo: '/assets/game-thumbnails/boulderBashIcon.png',
    mapPosition: { x: 486, y: 587 }, // Position in middle of map
    sceneClass: BoulderBashScene
  },
  {
    id: 'gem-hunt',
    name: 'Gem Hunt',
    description: 'Find the gems and avoid the skulls',
    photo: '/assets/game-thumbnails/gemHuntIcon.png',
    mapPosition: { x: 670, y: 460 }, // Position in middle of map
    sceneClass: GemHuntGame
  },
];

export function getGameById(id: string): GameData | undefined {
  return GAMES.find(game => game.id === id);
} 
