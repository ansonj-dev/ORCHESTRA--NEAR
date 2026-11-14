use near_sdk::{
    borsh::{self, BorshDeserialize, BorshSerialize},
    collections::Vector,
    env,
    json_types::U128,
    near, AccountId, NearToken, PanicOnDefault, Promise,
};
use near_sdk::store::LookupMap;
use near_sdk::BorshStorageKey;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::require;

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey { Agents, AgentIds, Jobs, Credits }

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct CreditAccount {
    /// NEAR-backed value in yoctoNEAR. The UI displays 100 CR per NEAR.
    balance_yocto: u128,
    /// Storage stake paid from the first top-up and returned when the account closes.
    storage_locked_yocto: u128,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[cfg_attr(not(target_arch = "wasm32"), derive(schemars::JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct Agent {
    pub agent_id: String,
    pub owner: AccountId,
    pub name: String,
    pub description: String,
    pub endpoint_url: String,
    pub price_yocto: U128,
    pub active: bool,
    pub registered_at: u64,
    pub rating_sum: u64,
    pub rating_count: u64,
    pub completed_jobs: u64,
    pub total_earned_yocto: U128,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[cfg_attr(not(target_arch = "wasm32"), derive(schemars::JsonSchema))]
#[serde(crate = "near_sdk::serde")]
pub struct Job {
    pub id: u64,
    pub agent_id: String,
    pub buyer: AccountId,
    pub provider: AccountId,
    pub payment_mode: String,
    pub task_hash: String,
    pub result_hash: Option<String>,
    pub price_yocto: U128,
    pub status: String,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub rated: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OrchestraContract {
    owner: AccountId,
    agents: LookupMap<String, Agent>,
    agent_ids: Vector<String>,
    jobs: Vector<Job>,
    credit_balances: LookupMap<AccountId, CreditAccount>,
}

#[near]
impl OrchestraContract {
    #[init]
    pub fn new(owner: Option<AccountId>) -> Self {
        Self {
            owner: owner.unwrap_or_else(env::predecessor_account_id),
            agents: LookupMap::new(StorageKey::Agents),
            agent_ids: Vector::new(StorageKey::AgentIds),
            jobs: Vector::new(StorageKey::Jobs),
            credit_balances: LookupMap::new(StorageKey::Credits),
        }
    }

    /// Register or update the caller's agent listing. The caller owns the listing.
    pub fn register_agent(&mut self, agent_id: String, name: String, description: String, price_yocto: U128, endpoint_url: String) {
        let caller = env::predecessor_account_id();
        let agent_id = Self::validate_agent_id(agent_id);
        require!(!name.trim().is_empty() && name.len() <= 80, "Invalid agent name");
        require!(description.len() <= 500, "Description too long");
        require!(endpoint_url.len() <= 300, "Agent endpoint URL too long");
        require!(!endpoint_url.is_empty() && endpoint_url.starts_with("https://"), "Agent endpoint must be a non-empty HTTPS URL");
        require!(endpoint_url.ends_with("/v1/execute"), "Agent endpoint must end with /v1/execute");
        require!(price_yocto.0 > 0, "Price must be greater than zero");

        if let Some(existing) = self.agents.get(&agent_id) {
            require!(existing.owner == caller, "Only the listing owner can update it");
            let registered_at = existing.registered_at;
            let rating_sum = existing.rating_sum;
            let rating_count = existing.rating_count;
            let completed_jobs = existing.completed_jobs;
            let total_earned_yocto = existing.total_earned_yocto.0;
            self.agents.insert(agent_id.clone(), Agent {
                agent_id, owner: caller, name, description, endpoint_url, price_yocto,
                active: true, registered_at,
                rating_sum,
                rating_count,
                completed_jobs,
                total_earned_yocto: U128(total_earned_yocto),
            });
        } else {
            let agent = Agent {
                agent_id: agent_id.clone(), owner: caller, name, description, endpoint_url,
                price_yocto, active: true, registered_at: env::block_timestamp(),
                rating_sum: 0, rating_count: 0, completed_jobs: 0,
                total_earned_yocto: U128(0),
            };
            self.agent_ids.push(&agent_id);
            self.agents.insert(agent_id, agent);
        }
    }

    /// Only the listing owner can pause or reactivate their agent.
    pub fn set_agent_active(&mut self, agent_id: String, active: bool) {
        let caller = env::predecessor_account_id();
        let agent_id = Self::validate_agent_id(agent_id);
        let mut agent = self.agents.get(&agent_id).expect("Agent not found").clone();
        require!(agent.owner == caller, "Only the listing owner can change agent status");
        agent.active = active;
        self.agents.insert(agent_id, agent);
    }

    /// Fund marketplace credits with NEAR. 1 NEAR is displayed as 100 CR.
    /// The first top-up reserves the account's storage cost; that reserve is
    /// returned when the credit account is fully withdrawn or spent.
    #[payable]
    pub fn deposit_credits(&mut self) -> U128 {
        let caller = env::predecessor_account_id();
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached > 0, "Attach NEAR to buy credits");

        if let Some(mut account) = self.credit_balances.get(&caller).cloned() {
            account.balance_yocto = account.balance_yocto.checked_add(attached)
                .expect("Credit balance overflow");
            self.credit_balances.insert(caller, account.clone());
            return U128(account.balance_yocto);
        }

        let storage_before = env::storage_usage();
        self.credit_balances.insert(caller.clone(), CreditAccount {
            balance_yocto: 0,
            storage_locked_yocto: 0,
        });
        let storage_bytes = env::storage_usage().saturating_sub(storage_before) as u128;
        let storage_locked = storage_bytes.saturating_mul(env::storage_byte_cost().as_yoctonear());
        require!(attached > storage_locked, "Top-up must cover the NEAR storage reserve");
        let credited = attached - storage_locked;
        let account = CreditAccount { balance_yocto: credited, storage_locked_yocto: storage_locked };
        self.credit_balances.insert(caller, account);
        U128(credited)
    }

    /// Public balance view. Balances are denominated in yoctoNEAR and displayed
    /// by the app as 100 CR per 1 NEAR.
    pub fn get_credit_balance(&self, account_id: AccountId) -> U128 {
        U128(self.credit_balances.get(&account_id)
            .map(|account| account.balance_yocto)
            .unwrap_or(0))
    }

    /// Withdraw credits back to the caller as NEAR. Withdrawing the full
    /// balance also releases the account's reserved storage stake.
    pub fn withdraw_credits(&mut self, amount_yocto: U128) -> Promise {
        let caller = env::predecessor_account_id();
        let mut account = self.credit_balances.get(&caller).cloned().expect("No credit balance");
        require!(amount_yocto.0 > 0, "Withdrawal must be greater than zero");
        require!(amount_yocto.0 <= account.balance_yocto, "Insufficient credit balance");

        let payout = if amount_yocto.0 == account.balance_yocto {
            self.credit_balances.remove(&caller);
            amount_yocto.0.checked_add(account.storage_locked_yocto).expect("Withdrawal overflow")
        } else {
            account.balance_yocto -= amount_yocto.0;
            self.credit_balances.insert(caller.clone(), account);
            amount_yocto.0
        };
        Promise::new(caller).transfer(NearToken::from_yoctonear(payout))
    }

    /// Hire an agent. The listed price is transferred directly to the provider.
    /// Only a task hash is stored on-chain; never publish private task data.
    #[payable]
    pub fn hire_agent(&mut self, agent_id: String, task_hash: String) -> Job {
        self.create_job(agent_id, task_hash, false)
    }

    /// Hire using the buyer's NEAR-backed credit balance instead of an
    /// attached deposit. The provider still receives the listed NEAR amount.
    pub fn hire_agent_with_credits(&mut self, agent_id: String, task_hash: String) -> Job {
        self.create_job(agent_id, task_hash, true)
    }

    fn create_job(&mut self, agent_id: String, task_hash: String, use_credits: bool) -> Job {
        let agent_id = Self::validate_agent_id(agent_id);
        let agent = self.agents.get(&agent_id).expect("Agent not found").clone();
        require!(agent.active, "Agent listing is inactive");
        require!(agent.owner != env::predecessor_account_id(), "Cannot hire your own agent");
        require!(task_hash.len() == 64 && task_hash.chars().all(|c| c.is_ascii_hexdigit()), "task_hash must be a SHA-256 hex digest");

        let attached = env::attached_deposit().as_yoctonear();
        let price = agent.price_yocto.0;
        let buyer = env::predecessor_account_id();
        let mut storage_refund = 0;
        if use_credits {
            require!(attached == 0, "Do not attach NEAR when paying with credits");
            let mut account = self.credit_balances.get(&buyer).cloned().expect("No credit balance");
            require!(account.balance_yocto >= price, "Insufficient credit balance");
            account.balance_yocto -= price;
            if account.balance_yocto == 0 {
                self.credit_balances.remove(&buyer);
                storage_refund = account.storage_locked_yocto;
            } else {
                self.credit_balances.insert(buyer.clone(), account);
            }
        } else {
            require!(attached >= price, "Attached deposit is below the listed price");
        }

        let job = Job {
            id: self.jobs.len(), agent_id, buyer, provider: agent.owner.clone(),
            payment_mode: if use_credits { "CREDITS".to_string() } else { "DIRECT_NEAR".to_string() },
            task_hash, result_hash: None, price_yocto: U128(price), status: "PAID".to_string(),
            created_at: env::block_timestamp(), completed_at: None, rated: false,
        };
        self.jobs.push(&job);

        Promise::new(agent.owner).transfer(NearToken::from_yoctonear(price));
        if use_credits && storage_refund > 0 {
            Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(storage_refund));
        } else if !use_credits && attached > price {
            Promise::new(env::predecessor_account_id())
                .transfer(NearToken::from_yoctonear(attached - price));
        }
        job
    }

    /// Provider assertion only; this does not independently verify off-chain work.
    pub fn complete_job(&mut self, job_id: u64, result_hash: String) {
        let mut job = self.jobs.get(job_id).expect("Job not found");
        require!(job.provider == env::predecessor_account_id(), "Only the provider can complete this job");
        require!(job.status == "PAID", "Job is not awaiting completion");
        require!(result_hash.len() == 64 && result_hash.chars().all(|c| c.is_ascii_hexdigit()), "result_hash must be a SHA-256 hex digest");
        job.result_hash = Some(result_hash);
        job.status = "COMPLETED".to_string();
        job.completed_at = Some(env::block_timestamp());
        let mut agent = self.agents.get(&job.agent_id).expect("Agent not found").clone();
        agent.completed_jobs = agent.completed_jobs.saturating_add(1);
        agent.total_earned_yocto = U128(agent.total_earned_yocto.0.saturating_add(job.price_yocto.0));
        self.agents.insert(job.agent_id.clone(), agent);
        self.jobs.replace(job_id, &job);
    }

    /// Buyer can leave one immutable 1-5 rating after the provider marks the job complete.
    pub fn rate_job(&mut self, job_id: u64, rating: u8) {
        require!((1..=5).contains(&rating), "Rating must be between 1 and 5");
        let mut job = self.jobs.get(job_id).expect("Job not found");
        require!(job.buyer == env::predecessor_account_id(), "Only the buyer can rate this job");
        require!(job.status == "COMPLETED", "Only completed jobs can be rated");
        require!(!job.rated, "This job has already been rated");

        let mut agent = self.agents.get(&job.agent_id).expect("Agent not found").clone();
        agent.rating_sum = agent.rating_sum.saturating_add(rating as u64);
        agent.rating_count = agent.rating_count.saturating_add(1);
        self.agents.insert(job.agent_id.clone(), agent);
        job.rated = true;
        self.jobs.replace(job_id, &job);
    }

    pub fn get_job(&self, job_id: u64) -> Option<Job> {
        self.jobs.get(job_id)
    }

    pub fn get_agent(&self, agent_id: String) -> Option<Agent> {
        self.agents.get(&agent_id).cloned()
    }

    pub fn get_agents(&self, from_index: u32, limit: u32) -> Vec<Agent> {
        let start = from_index as u64;
        let end = std::cmp::min(self.agent_ids.len(), start.saturating_add(limit.min(50) as u64));
        (start..end)
            .filter_map(|index| self.agent_ids.get(index))
            .filter_map(|id| self.agents.get(&id).cloned())
            .collect()
    }

    pub fn get_jobs(&self, from_index: u32, limit: u32) -> Vec<Job> {
        let start = from_index as u64;
        let end = std::cmp::min(self.jobs.len(), start.saturating_add(limit.min(50) as u64));
        (start..end).filter_map(|index| self.jobs.get(index)).collect()
    }

    pub fn get_agent_count(&self) -> u64 { self.agent_ids.len() }

    pub fn get_job_count(&self) -> u64 { self.jobs.len() }

    pub fn get_owner(&self) -> AccountId { self.owner.clone() }

    fn validate_agent_id(agent_id: String) -> String {
        let normalized = agent_id.trim().to_ascii_lowercase();
        require!(!normalized.is_empty() && normalized.len() <= 48, "Invalid agent id length");
        require!(normalized.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_'), "Agent id contains invalid characters");
        normalized
    }
}

#[cfg(test)]
mod tests;
