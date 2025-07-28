use anchor_lang::prelude::*;

#[error_code]
pub enum FeedError {
    #[msg("Invalid feed configuration.")]
    InvalidFeedConfig,
    #[msg("This operation is not supported for this feed type.")]
    NotSupported,
    #[msg("The caller is not the owner of the feed.")]
    NotFeedOwner,
    #[msg("The provided answer has a timestamp in the past.")]
    PastTimestamp,
    #[msg("The provided answer has a timestamp in the future.")]
    FutureTimestamp,
    #[msg("The answer value cannot be empty.")]
    ZeroValue,
    #[msg("Insufficient balance for this operation.")]
    InsufficientBalance,
}
