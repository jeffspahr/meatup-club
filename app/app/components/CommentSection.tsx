import { Form } from "react-router";
import { useState } from "react";
import { Card, Button, EmptyState } from "./ui";
import { CommentThread } from "./CommentThread";

interface CommentSectionProps {
  comments: any[];
  currentUser: { id: number; isAdmin: boolean };
  title?: string;
  placeholder?: string;
}

export function CommentSection({
  comments,
  currentUser,
  title = "Discussion",
  placeholder = "Share your thoughts...",
}: CommentSectionProps) {
  const [replyingTo, setReplyingTo] = useState<number | null>(null);

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-foreground mb-6">{title}</h2>

      {/* Add Comment Form */}
      <Form method="post" className="mb-6">
        <input type="hidden" name="_action" value="add_comment" />
        <Card className="p-4">
          <textarea
            name="content"
            placeholder={placeholder}
            className="w-full border border-border bg-background text-foreground rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
            rows={3}
            maxLength={1000}
            required
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-muted-foreground">Max 1000 characters</span>
            <Button type="submit" size="sm">
              Post Comment
            </Button>
          </div>
        </Card>
      </Form>

      {/* Comments List */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <EmptyState
            title="No comments yet"
            description="Be the first to share your thoughts!"
          />
        ) : (
          comments.map((comment: any) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              currentUser={currentUser}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
            />
          ))
        )}
      </div>
    </div>
  );
}
