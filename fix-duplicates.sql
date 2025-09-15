-- Clean up duplicates first
DELETE FROM conversations 
WHERE id NOT IN (
  SELECT MAX(id) 
  FROM conversations 
  GROUP BY conversation_id
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE conversations 
ADD CONSTRAINT unique_conversation_id UNIQUE (conversation_id);
