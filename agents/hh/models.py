from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class SearchProfile(Base):
    __tablename__ = "search_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    keywords: Mapped[str] = mapped_column(Text)
    area: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserProfile(Base):
    __tablename__ = "user_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[str] = mapped_column(Text)
    skills: Mapped[str] = mapped_column(Text)
    experience_summary: Mapped[str] = mapped_column(Text)
    salary_expected: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stop_words: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_letter_tone: Mapped[str] = mapped_column(Text, default="formal")


class Vacancy(Base):
    __tablename__ = "vacancies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vacancy_id: Mapped[str] = mapped_column(Text, unique=True)
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    employer: Mapped[str | None] = mapped_column(Text, nullable=True)
    salary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_skills: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    experience: Mapped[str | None] = mapped_column(Text, nullable=True)
    employment: Mapped[str | None] = mapped_column(Text, nullable=True)
    pub_date: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class VacancyMatch(Base):
    __tablename__ = "vacancy_matches"
    __table_args__ = (UniqueConstraint("profile_id", "vacancy_id", name="uq_vacancy_match_profile_vacancy"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int] = mapped_column(Integer)
    vacancy_id: Mapped[str] = mapped_column(Text)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Negotiation(Base):
    __tablename__ = "negotiations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vacancy_id: Mapped[str] = mapped_column(Text)
    cover_letter: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
