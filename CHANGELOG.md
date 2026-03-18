# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-03-18

### Added
- **Command Word Mastery Tracking** (`getTechniqueMastery` engine function) — per-command-word statistics including question attempts, average score, and trend analysis (improving/stable/declining/insufficient_data)
- **Command Word Context Retrieval** (`getCommandWordsForQualification`) — query command words for a specific qualification
- **Formatted Command Word Guidance** (`formatCommandWordSection`) — markdown output with command word definitions, mark scheme coaching patterns (1/2/4/6-mark structures), and timed practice awareness
- **Exam Technique Coaching** — integrated command word guidance into all 8 study session prompts (retrieval-drill, timed-problems, essay-planning, explanation, worked-example, source-analysis, mistake-review, reentry) with coaching on what each command word requires and how to allocate marks

### Changed
- Enhanced all study session prompts to include explicit command word and exam technique coaching sections
- Improved essay-planning session flow to emphasize mark scheme structure
- Updated timed-problems session to include mark allocation guidance and pacing awareness
- Expanded explanation and worked-example sessions with exam-style framing

## [0.1.0] - Phase 4 Initial Release

### Added
- Firebase Authentication (Google Sign-In)
- Route protection middleware
- Household organization model with learner/guardian membership
- Guardian linking via invite codes
- Session-based authentication with cookies

### Fixed
- Integrated `endSession` with mastery engine
- Fixed `getNextBlocks` idempotency handling
- Updated `selectBlockType` to read task_rules and fall back to heuristic
