import { AnimalFinderGame } from '../scenes/games/animalFinder/AnimalFinderGame';
import { CosmoClimbScene } from '../scenes/games/cosmoClimb/CosmoClimb';
import { FloatFrenzy } from '../scenes/games/floatFrenzy/FloatFrenzy';

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
    mapPosition: { x: 850, y: 80 },
    sceneClass: CosmoClimbScene
  },
  {
    id: 'animal-finder', 
    name: 'Animal Finder',
    description: 'Find the wanted animals on the screen',
    photo: '/assets/game-thumbnails/animalFinderLogo.png',
    mapPosition: { x: 100, y: 570 },
    sceneClass: AnimalFinderGame
  },
  // {
  //   id: 'ocean-explorer',
  //   name: 'Ocean Explorer',
  //   description: 'Dive deep into the ocean to discover treasures',
  //   photo: '/assets/game-thumbnails/ocean-explorer.png',
  //   mapPosition: { x: 20, y: 80 },
  //   sceneClass: null
  // },
  {
    id: 'float-frenzy',
    name: 'Float Frenzy',
    description: 'Float through the ocean, avoid bombs and collect powerups',
    photo: '/assets/game-thumbnails/animalFinderLogo.png',
    mapPosition: { x: 20, y: 80 }, // edit to be where you want it on the map
    sceneClass: FloatFrenzy
  }
];

export function getGameById(id: string): GameData | undefined {
  return GAMES.find(game => game.id === id);
} 
