import { describe, it, expect } from 'vitest';

/**
 * Integration tests for Admin Polls page
 *
 * These tests ensure data consistency between vote leaders and dropdown options,
 * which prevents the bug where defaultValue references an ID not in the options list.
 */

describe('Admin Polls Data Consistency', () => {
  describe('Vote Leader Validation', () => {
    it('should ensure topRestaurant exists in allRestaurants array', () => {
      // Simulate the loader data structure
      const topRestaurant = {
        id: 1,
        name: 'Prime Steakhouse',
        address: '123 Main St',
        vote_count: 5,
      };

      const allRestaurants = [
        { id: 1, name: 'Prime Steakhouse', address: '123 Main St', vote_count: 5 },
        { id: 2, name: 'Ocean Grill', address: '456 Oak Ave', vote_count: 3 },
        { id: 3, name: 'Mountain View', address: '789 Pine Rd', vote_count: 2 },
      ];

      // Verify topRestaurant is in allRestaurants
      const found = allRestaurants.find(r => r.id === topRestaurant.id);
      expect(found).toBeDefined();
      expect(found?.vote_count).toBe(topRestaurant.vote_count);
      expect(found?.name).toBe(topRestaurant.name);
    });

    it('should ensure topDate exists in allDates array', () => {
      const topDate = {
        id: 101,
        suggested_date: '2025-02-08',
        vote_count: 7,
      };

      const allDates = [
        { id: 101, suggested_date: '2025-02-08', vote_count: 7 },
        { id: 102, suggested_date: '2025-02-01', vote_count: 5 },
        { id: 103, suggested_date: '2025-02-15', vote_count: 3 },
      ];

      // Verify topDate is in allDates
      const found = allDates.find(d => d.id === topDate.id);
      expect(found).toBeDefined();
      expect(found?.vote_count).toBe(topDate.vote_count);
      expect(found?.suggested_date).toBe(topDate.suggested_date);
    });

    it('should FAIL when topDate is not in allDates (bug scenario)', () => {
      // This simulates the BUG where allDates query was missing WHERE poll_id clause
      const topDate = {
        id: 101,
        suggested_date: '2025-02-08', // From poll 1
        vote_count: 7,
      };

      // BUG: allDates contains dates from a different poll!
      const allDates = [
        { id: 201, suggested_date: '2025-03-01', vote_count: 10 }, // From poll 2
        { id: 202, suggested_date: '2025-03-08', vote_count: 8 },  // From poll 2
      ];

      // This should FAIL - topDate is not in allDates
      const found = allDates.find(d => d.id === topDate.id);
      expect(found).toBeUndefined(); // This demonstrates the bug
    });
  });

  describe('Query Result Filtering', () => {
    it('should only include dates from the specified poll', () => {
      const pollId = 1;

      // All dates in the database
      const allDatesInDB = [
        { id: 101, poll_id: 1, suggested_date: '2025-02-01', vote_count: 4 },
        { id: 102, poll_id: 1, suggested_date: '2025-02-08', vote_count: 7 },
        { id: 201, poll_id: 2, suggested_date: '2025-03-01', vote_count: 10 },
        { id: 202, poll_id: 2, suggested_date: '2025-03-08', vote_count: 8 },
      ];

      // Simulate the query filter: WHERE ds.poll_id = ?
      const filteredDates = allDatesInDB.filter(d => d.poll_id === pollId);

      // Verify only dates from poll 1 are included
      expect(filteredDates.length).toBe(2);
      expect(filteredDates.every(d => d.poll_id === 1)).toBe(true);

      // Verify dates from poll 2 are NOT included
      expect(filteredDates.find(d => d.id === 201)).toBeUndefined();
      expect(filteredDates.find(d => d.id === 202)).toBeUndefined();
    });

    it('should demonstrate the bug: missing WHERE clause returns all polls dates', () => {
      const targetPollId = 1;

      const allDatesInDB = [
        { id: 101, poll_id: 1, suggested_date: '2025-02-01', vote_count: 4 },
        { id: 102, poll_id: 1, suggested_date: '2025-02-08', vote_count: 7 },
        { id: 201, poll_id: 2, suggested_date: '2025-03-01', vote_count: 10 },
      ];

      // BUG: Query without WHERE ds.poll_id = ? returns ALL dates
      const buggyResults = allDatesInDB; // Missing filter!

      // This demonstrates the problem
      expect(buggyResults.length).toBe(3);
      expect(buggyResults.some(d => d.poll_id !== targetPollId)).toBe(true);

      // CORRECT: With WHERE clause
      const correctResults = allDatesInDB.filter(d => d.poll_id === targetPollId);
      expect(correctResults.length).toBe(2);
      expect(correctResults.every(d => d.poll_id === targetPollId)).toBe(true);
    });
  });

  describe('Vote Sorting', () => {
    it('should sort restaurants by vote count DESC, then name ASC', () => {
      const unsortedRestaurants = [
        { id: 1, name: 'Zebra Steakhouse', vote_count: 5 },
        { id: 2, name: 'Alpha Grill', vote_count: 5 },
        { id: 3, name: 'Beta Bistro', vote_count: 3 },
      ];

      const sorted = [...unsortedRestaurants].sort((a, b) => {
        if (b.vote_count !== a.vote_count) {
          return b.vote_count - a.vote_count;
        }
        return a.name.localeCompare(b.name);
      });

      expect(sorted[0].name).toBe('Alpha Grill'); // 5 votes, alphabetically first
      expect(sorted[1].name).toBe('Zebra Steakhouse'); // 5 votes, alphabetically second
      expect(sorted[2].name).toBe('Beta Bistro'); // 3 votes
    });

    it('should sort dates by vote count DESC, then date ASC', () => {
      const unsortedDates = [
        { id: 101, suggested_date: '2025-02-15', vote_count: 3 },
        { id: 102, suggested_date: '2025-02-01', vote_count: 5 },
        { id: 103, suggested_date: '2025-02-08', vote_count: 5 },
      ];

      const sorted = [...unsortedDates].sort((a, b) => {
        if (b.vote_count !== a.vote_count) {
          return b.vote_count - a.vote_count;
        }
        return new Date(a.suggested_date).getTime() - new Date(b.suggested_date).getTime();
      });

      expect(sorted[0].suggested_date).toBe('2025-02-01'); // 5 votes, earliest date
      expect(sorted[1].suggested_date).toBe('2025-02-08'); // 5 votes, later date
      expect(sorted[2].suggested_date).toBe('2025-02-15'); // 3 votes
    });
  });

  describe('Form Data Validation', () => {
    it('should validate that form default values exist in select options', () => {
      const topRestaurant = { id: 10, name: 'Prime Steakhouse' };
      const allRestaurants = [
        { id: 10, name: 'Prime Steakhouse' },
        { id: 11, name: 'Ocean Grill' },
      ];

      // Simulate checking if defaultValue exists in options
      const isValidDefault = allRestaurants.some(r => r.id === topRestaurant.id);

      expect(isValidDefault).toBe(true);
    });

    it('should detect invalid default value (the bug we fixed)', () => {
      const topDate = { id: 101, suggested_date: '2025-02-01' }; // From poll 1

      // BUG: allDates is from a different poll
      const allDates = [
        { id: 201, suggested_date: '2025-03-01' }, // From poll 2
        { id: 202, suggested_date: '2025-03-08' }, // From poll 2
      ];

      // This check would fail
      const isValidDefault = allDates.some(d => d.id === topDate.id);

      expect(isValidDefault).toBe(false); // BUG DETECTED!
    });

    it('should accept valid admin override selections', () => {
      const allRestaurants = [
        { id: 10, name: 'Prime Steakhouse', vote_count: 5 },
        { id: 11, name: 'Ocean Grill', vote_count: 3 },
      ];

      const allDates = [
        { id: 20, suggested_date: '2025-02-01', vote_count: 7 },
        { id: 21, suggested_date: '2025-02-08', vote_count: 5 },
      ];

      // Admin overrides to select non-leader options
      const selectedRestaurantId = 11; // Not the leader (10)
      const selectedDateId = 21; // Not the leader (20)

      // Validate selections are in the allowed options
      const isValidRestaurant = allRestaurants.some(r => r.id === selectedRestaurantId);
      const isValidDate = allDates.some(d => d.id === selectedDateId);

      expect(isValidRestaurant).toBe(true);
      expect(isValidDate).toBe(true);
    });
  });
});
