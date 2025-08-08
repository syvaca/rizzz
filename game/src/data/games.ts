import { AnimalFinderGame } from '../scenes/games/animalFinder/AnimalFinderGame';
import { CosmoClimbScene } from '../scenes/games/cosmoClimb/CosmoClimb';
import { FloatFrenzy } from '../scenes/games/floatFrenzy/FloatFrenzy';
import { QuickTapPoker } from '../scenes/games/quickTapPoker/QuickTapPoker';
import { BoulderBashScene } from '../scenes/games/boulderBash/BoulderBash';

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
    photo: '/assets/game-thumbnails/animalFinderLogo.png',
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
    id: 'boulder-bash',
    name: 'Boulder Bash',
    description: 'Destroy the boulders before they hit you!',
    photo: '/assets/game-thumbnails/boulderBashIcon.png',
    mapPosition: { x: 486, y: 587 }, // Position in middle of map
    sceneClass: BoulderBashScene
  }
];

export function getGameById(id: string): GameData | undefined {
  return GAMES.find(game => game.id === id);
} 
