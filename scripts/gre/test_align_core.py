"""Validate the capacity optimizer against exhaustive assignments on small inputs."""
from itertools import permutations
import random
import unittest

from align_core import minimum_assignment


class AssignmentTest(unittest.TestCase):
    def test_global_capacity_beats_greedy(self):
        costs = [[-10, -9], [-10, 0]]
        self.assertEqual(minimum_assignment(costs), [1, 0])

    def test_matches_exhaustive_rectangular_optimum(self):
        rng = random.Random(42)
        for _ in range(40):
            matrix = [[rng.randrange(-100, 100) for _ in range(5)] for _ in range(3)]
            result = minimum_assignment(matrix)
            actual = sum(matrix[i][j] for i, j in enumerate(result))
            expected = min(sum(matrix[i][j] for i, j in enumerate(p)) for p in permutations(range(5), 3))
            self.assertEqual(actual, expected)
            self.assertEqual(len(set(result)), len(result))


if __name__ == "__main__":
    unittest.main()
