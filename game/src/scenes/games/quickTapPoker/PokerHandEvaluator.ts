import { PlayingCard } from './PlayingCard';

export interface HandResult {
  handName: string;
  score: number;
  cards: PlayingCard[];
}

export class PokerHandEvaluator {
  private static readonly HAND_RANKINGS = {
    'High Card': 1,
    'Pair': 2,
    'Two Pair': 3,
    'Three of a Kind': 4,
    'Straight': 5,
    'Flush': 6,
    'Full House': 7,
    'Four of a Kind': 8,
    'Straight Flush': 9,
    'Royal Flush': 10
  };

  private static readonly BASE_SCORES = {
    'High Card': 1,
    'Pair': 5,
    'Two Pair': 10,
    'Three of a Kind': 20,
    'Straight': 40,
    'Flush': 50,
    'Full House': 80,
    'Four of a Kind': 120,
    'Straight Flush': 200,
    'Royal Flush': 500
  };

  public static evaluateHand(cards: PlayingCard[]): HandResult {
    // Handle cases where less than 5 cards are selected
    if (cards.length === 0) {
      return {
        handName: 'No Cards',
        score: 0,
        cards: []
      };
    }

    if (cards.length < 5) {
      // Evaluate partial hands with reduced scoring
      const partialResult = this.evaluatePartialHand(cards);
      return {
        handName: `${partialResult.handName} (${cards.length} cards)`,
        score: Math.floor(partialResult.score * (cards.length / 5)), // Reduce score proportionally
        cards: cards
      };
    }

    // Sort cards by value for easier evaluation
    const sortedCards = [...cards].sort((a, b) => a.value - b.value);
    
    // Check for each hand type from highest to lowest
    if (this.isRoyalFlush(sortedCards)) {
      return { handName: 'Royal Flush', score: this.BASE_SCORES['Royal Flush'], cards: sortedCards };
    }
    
    if (this.isStraightFlush(sortedCards)) {
      return { handName: 'Straight Flush', score: this.BASE_SCORES['Straight Flush'], cards: sortedCards };
    }
    
    if (this.isFourOfAKind(sortedCards)) {
      return { handName: 'Four of a Kind', score: this.BASE_SCORES['Four of a Kind'], cards: sortedCards };
    }
    
    if (this.isFullHouse(sortedCards)) {
      return { handName: 'Full House', score: this.BASE_SCORES['Full House'], cards: sortedCards };
    }
    
    if (this.isFlush(sortedCards)) {
      return { handName: 'Flush', score: this.BASE_SCORES['Flush'], cards: sortedCards };
    }
    
    if (this.isStraight(sortedCards)) {
      return { handName: 'Straight', score: this.BASE_SCORES['Straight'], cards: sortedCards };
    }
    
    if (this.isThreeOfAKind(sortedCards)) {
      return { handName: 'Three of a Kind', score: this.BASE_SCORES['Three of a Kind'], cards: sortedCards };
    }
    
    if (this.isTwoPair(sortedCards)) {
      return { handName: 'Two Pair', score: this.BASE_SCORES['Two Pair'], cards: sortedCards };
    }
    
    if (this.isPair(sortedCards)) {
      return { handName: 'Pair', score: this.BASE_SCORES['Pair'], cards: sortedCards };
    }
    
    return { handName: 'High Card', score: this.BASE_SCORES['High Card'], cards: sortedCards };
  }

  private static evaluatePartialHand(cards: PlayingCard[]): { handName: string; score: number } {
    const sortedCards = [...cards].sort((a, b) => a.value - b.value);
    
    // Check what we can determine with partial cards
    if (this.isPair(sortedCards)) {
      return { handName: 'Pair', score: this.BASE_SCORES['Pair'] };
    }
    
    if (this.isFlush(sortedCards)) {
      return { handName: 'Flush Draw', score: this.BASE_SCORES['Flush'] };
    }
    
    if (this.isPartialStraight(sortedCards)) {
      return { handName: 'Straight Draw', score: this.BASE_SCORES['Straight'] };
    }
    
    return { handName: 'High Card', score: this.BASE_SCORES['High Card'] };
  }

  private static isRoyalFlush(cards: PlayingCard[]): boolean {
    if (!this.isFlush(cards) || !this.isStraight(cards)) return false;
    
    // Check if it's 10, J, Q, K, A
    const values = cards.map(card => card.value).sort((a, b) => a - b);
    return values.join(',') === '10,11,12,13,14';
  }

  private static isStraightFlush(cards: PlayingCard[]): boolean {
    return this.isFlush(cards) && this.isStraight(cards) && !this.isRoyalFlush(cards);
  }

  private static isFourOfAKind(cards: PlayingCard[]): boolean {
    const valueCounts = this.getValueCounts(cards);
    return Object.values(valueCounts).includes(4);
  }

  private static isFullHouse(cards: PlayingCard[]): boolean {
    const valueCounts = this.getValueCounts(cards);
    const counts = Object.values(valueCounts).sort((a, b) => b - a);
    return counts[0] === 3 && counts[1] === 2;
  }

  private static isFlush(cards: PlayingCard[]): boolean {
    if (cards.length < 5) {
      // For partial hands, check if all cards are same suit
      const firstSuit = cards[0].suit;
      return cards.every(card => card.suit === firstSuit);
    }
    
    const firstSuit = cards[0].suit;
    return cards.every(card => card.suit === firstSuit);
  }

  private static isStraight(cards: PlayingCard[]): boolean {
    if (cards.length < 5) return false;
    
    const values = cards.map(card => card.value).sort((a, b) => a - b);
    
    // Check for regular straight
    for (let i = 1; i < values.length; i++) {
      if (values[i] !== values[i - 1] + 1) {
        // Check for A-2-3-4-5 straight (wheel)
        if (values.join(',') === '2,3,4,5,14') {
          return true;
        }
        return false;
      }
    }
    return true;
  }

  private static isPartialStraight(cards: PlayingCard[]): boolean {
    if (cards.length < 3) return false;
    
    const values = [...new Set(cards.map(card => card.value))].sort((a, b) => a - b);
    
    // Check if we have consecutive values
    for (let i = 1; i < values.length; i++) {
      if (values[i] !== values[i - 1] + 1) {
        return false;
      }
    }
    return true;
  }

  private static isThreeOfAKind(cards: PlayingCard[]): boolean {
    const valueCounts = this.getValueCounts(cards);
    return Object.values(valueCounts).includes(3);
  }

  private static isTwoPair(cards: PlayingCard[]): boolean {
    const valueCounts = this.getValueCounts(cards);
    const pairCount = Object.values(valueCounts).filter(count => count === 2).length;
    return pairCount === 2;
  }

  private static isPair(cards: PlayingCard[]): boolean {
    const valueCounts = this.getValueCounts(cards);
    return Object.values(valueCounts).includes(2);
  }

  private static getValueCounts(cards: PlayingCard[]): { [value: number]: number } {
    const counts: { [value: number]: number } = {};
    
    cards.forEach(card => {
      counts[card.value] = (counts[card.value] || 0) + 1;
    });
    
    return counts;
  }
}
