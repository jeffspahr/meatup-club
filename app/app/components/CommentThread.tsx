import { Form } from "react-router";
import { Card, Button, UserAvatar } from "./ui";

interface CommentUser {
  id: number;
  isAdmin: boolean;
}

interface CommentData {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email: string;
  user_picture: string | null;
  content: string;
  created_at: string;
  replies?: CommentData[];
}

interface CommentThreadProps {
  comment: CommentData;
  currentUser: CommentUser;
  replyingTo: number | null;
  setReplyingTo: (id: number | null) => void;
  depth?: number;
}

const MAX_DEPTH = 5;

export function CommentThread({
  comment,
  currentUser,
  replyingTo,
  setReplyingTo,
  depth = 0,
}: CommentThreadProps) {
  const isReplying = replyingTo === comment.id;

  return (
    <div className={depth > 0 ? "ml-8 mt-4 border-l-2 border-border pl-4" : ""}>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <UserAvatar
            src={comment.user_picture}
            name={comment.user_name}
            email={comment.user_email}
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  {comment.user_name || comment.user_email}
                </span>
                {comment.user_id === currentUser.id && (
                  <span className="text-xs text-accent">(you)</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.created_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                {(comment.user_id === currentUser.id || currentUser.isAdmin) && (
                  <Form method="post" className="inline">
                    <input type="hidden" name="_action" value="delete_comment" />
                    <input type="hidden" name="comment_id" value={comment.id} />
                    <button
                      type="submit"
                      className="text-xs text-red-600 hover:text-red-700"
                      onClick={(e) => {
                        if (!confirm('Delete this comment and all replies?')) {
                          e.preventDefault();
                        }
                      }}
                    >
                      Delete
                    </button>
                  </Form>
                )}
              </div>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
              {comment.content}
            </p>
            <div className="mt-2 flex gap-3">
              {depth < MAX_DEPTH && (
                <button
                  onClick={() => setReplyingTo(isReplying ? null : comment.id)}
                  className="text-xs text-accent hover:underline"
                >
                  {isReplying ? 'Cancel' : 'Reply'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reply Form */}
        {isReplying && (
          <div className="mt-4 ml-13">
            <Form method="post" onSubmit={() => setReplyingTo(null)}>
              <input type="hidden" name="_action" value="add_comment" />
              <input type="hidden" name="parent_id" value={comment.id} />
              <textarea
                name="content"
                placeholder="Write a reply..."
                className="w-full border border-border bg-background text-foreground rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                rows={3}
                maxLength={1000}
                required
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyingTo(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Reply
                </Button>
              </div>
            </Form>
          </div>
        )}
      </Card>

      {/* Nested Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2">
          {comment.replies.map((reply: any) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              currentUser={currentUser}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
