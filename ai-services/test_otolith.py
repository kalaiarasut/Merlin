#!/usr/bin/env python3
"""Quick test script for otolith analysis"""

import sys
sys.path.insert(0, '.')

from otolith.otolith_analyzer import OtolithAnalyzer

print('Loading analyzer...')
analyzer = OtolithAnalyzer()

print('Running analysis on test image...')
try:
    result = analyzer.analyze_age(
        r'd:\Ocean\backend\storage\otoliths\1764915738402-HI-001121.jpg', 
        method='ensemble'
    )
    print('\n=== SUCCESS ===')
    print(f"Estimated age: {result['age_estimation']['estimated_age']} years")
    print(f"Confidence: {result['age_estimation']['confidence']:.2%}")
    print(f"Confidence level: {result['age_estimation']['confidence_level']}")
    print(f"Age range: {result['age_estimation']['age_range']}")
except Exception as e:
    print('\n=== ERROR ===')
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
