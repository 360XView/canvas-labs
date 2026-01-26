import pytest
from src.main import hello, greet


def test_hello_world():
    """Test that hello() returns the correct greeting"""
    assert hello() == "Hello, World!"


def test_greet():
    """Test that greet(name) returns a personalized greeting"""
    assert greet("Alice") == "Hello, Alice!"
    assert greet("Bob") == "Hello, Bob!"
    assert greet("Charlie") == "Hello, Charlie!"
