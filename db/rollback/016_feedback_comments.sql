-- Run in a transaction; refuse once anyone has written, edited, liked or deleted a reply, since the old schema had
-- one note per feedback and would lose them. Replies carried over from notes still exist in owner_feedback_cases.
LOCK TABLE feedback_comments, feedback_comment_revisions, feedback_comment_likes IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM feedback_comments WHERE NOT from_note OR edited_at IS NOT NULL OR deleted_at IS NOT NULL OR pinned_at IS NOT NULL)
   OR EXISTS(SELECT 1 FROM feedback_comment_likes) OR EXISTS(SELECT 1 FROM feedback_comment_revisions) THEN
   RAISE EXCEPTION 'COMMENTS_PRESENT: keep migration 016 and roll the application back instead';
 END IF;
END $$;
DROP TABLE feedback_comment_likes;
DROP TABLE feedback_comment_revisions;
DROP FUNCTION feedback_comment_revisions_append_only();
DROP TABLE feedback_comments;
