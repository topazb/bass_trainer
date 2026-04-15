from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    google_id = Column(String(100), unique=True, nullable=True, index=True)
    email     = Column(String(200), nullable=True, index=True)
    is_guest  = Column(Boolean, default=False)

    sessions = relationship("PracticeSession", back_populates="user")


class PracticeSession(Base):
    __tablename__ = "practice_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    program_id = Column(String(100), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)
    completed = Column(Boolean, default=False)
    blocks_completed = Column(Integer, default=0)

    user = relationship("User", back_populates="sessions")
    quiz_results = relationship("QuizResult", back_populates="session")


class QuizResult(Base):
    __tablename__ = "quiz_results"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("practice_sessions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    quiz_type = Column(String(50), nullable=False)   # "fretboard" | "ear_training"
    correct = Column(Integer, default=0)
    total = Column(Integer, default=0)
    difficulty = Column(String(50), nullable=True)   # for ear_training
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("PracticeSession", back_populates="quiz_results")
