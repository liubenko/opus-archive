export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      catalog_suggestions: {
        Row: {
          composer_avatar_url: string | null;
          composer_birth_place: string | null;
          composer_birth_year: number | null;
          composer_death_year: number | null;
          composer_era: string | null;
          composer_imslp_url: string | null;
          composer_nationality: string | null;
          composer_short_bio: string | null;
          created_at: string;
          dedup_key: string;
          id: number;
          matched_composer_id: number | null;
          occurrence_count: number;
          resolved_composer_id: number | null;
          resolved_work_id: number | null;
          sample_event_id: number | null;
          source_context: string | null;
          source_type: string;
          source_url: string | null;
          status: string;
          submitted_by_user_id: string | null;
          submitter_note: string | null;
          suggested_catalog_display: string | null;
          suggested_composer_name: string;
          suggested_description: string | null;
          suggested_duration_minutes: number | null;
          suggested_genre: string | null;
          suggested_imslp_url: string | null;
          suggested_instrumentation: string | null;
          suggested_key_signature: string | null;
          suggested_work_title: string;
          suggested_year: number | null;
          suggestion_type: string;
          updated_at: string;
        };
        Insert: {
          composer_avatar_url?: string | null;
          composer_birth_place?: string | null;
          composer_birth_year?: number | null;
          composer_death_year?: number | null;
          composer_era?: string | null;
          composer_imslp_url?: string | null;
          composer_nationality?: string | null;
          composer_short_bio?: string | null;
          created_at?: string;
          dedup_key: string;
          id?: never;
          matched_composer_id?: number | null;
          occurrence_count?: number;
          resolved_composer_id?: number | null;
          resolved_work_id?: number | null;
          sample_event_id?: number | null;
          source_context?: string | null;
          source_type?: string;
          source_url?: string | null;
          status?: string;
          submitted_by_user_id?: string | null;
          submitter_note?: string | null;
          suggested_catalog_display?: string | null;
          suggested_composer_name: string;
          suggested_description?: string | null;
          suggested_duration_minutes?: number | null;
          suggested_genre?: string | null;
          suggested_imslp_url?: string | null;
          suggested_instrumentation?: string | null;
          suggested_key_signature?: string | null;
          suggested_work_title: string;
          suggested_year?: number | null;
          suggestion_type?: string;
          updated_at?: string;
        };
        Update: {
          composer_avatar_url?: string | null;
          composer_birth_place?: string | null;
          composer_birth_year?: number | null;
          composer_death_year?: number | null;
          composer_era?: string | null;
          composer_imslp_url?: string | null;
          composer_nationality?: string | null;
          composer_short_bio?: string | null;
          created_at?: string;
          dedup_key?: string;
          id?: never;
          matched_composer_id?: number | null;
          occurrence_count?: number;
          resolved_composer_id?: number | null;
          resolved_work_id?: number | null;
          sample_event_id?: number | null;
          source_context?: string | null;
          source_type?: string;
          source_url?: string | null;
          status?: string;
          submitted_by_user_id?: string | null;
          submitter_note?: string | null;
          suggested_catalog_display?: string | null;
          suggested_composer_name?: string;
          suggested_description?: string | null;
          suggested_duration_minutes?: number | null;
          suggested_genre?: string | null;
          suggested_imslp_url?: string | null;
          suggested_instrumentation?: string | null;
          suggested_key_signature?: string | null;
          suggested_work_title?: string;
          suggested_year?: number | null;
          suggestion_type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      concert_event_performers: {
        Row: {
          billing_role: string;
          created_at: string;
          display_order: number;
          event_id: number;
          id: number;
          instrument_label: string | null;
          performer_id: number;
        };
        Insert: {
          billing_role?: string;
          created_at?: string;
          display_order?: number;
          event_id: number;
          id?: never;
          instrument_label?: string | null;
          performer_id: number;
        };
        Update: {
          billing_role?: string;
          created_at?: string;
          display_order?: number;
          event_id?: number;
          id?: never;
          instrument_label?: string | null;
          performer_id?: number;
        };
        Relationships: [];
      };
      concert_event_works: {
        Row: {
          composer_id: number | null;
          created_at: string;
          display_order: number;
          event_id: number;
          id: number;
          is_world_premiere: boolean;
          program_note: string | null;
          raw_composer_name: string;
          raw_work_title: string;
          suggestion_id: number | null;
          work_id: number | null;
        };
        Insert: {
          composer_id?: number | null;
          created_at?: string;
          display_order?: number;
          event_id: number;
          id?: never;
          is_world_premiere?: boolean;
          program_note?: string | null;
          raw_composer_name: string;
          raw_work_title: string;
          suggestion_id?: number | null;
          work_id?: number | null;
        };
        Update: {
          composer_id?: number | null;
          created_at?: string;
          display_order?: number;
          event_id?: number;
          id?: never;
          is_world_premiere?: boolean;
          program_note?: string | null;
          raw_composer_name?: string;
          raw_work_title?: string;
          suggestion_id?: number | null;
          work_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "concert_event_works_work_id_fkey";
            columns: ["work_id"];
            isOneToOne: false;
            referencedRelation: "works";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "concert_event_works_composer_id_fkey";
            columns: ["composer_id"];
            isOneToOne: false;
            referencedRelation: "composers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "concert_event_works_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "concert_events";
            referencedColumns: ["id"];
          },
        ];
      };
      concert_events: {
        Row: {
          conductor_id: number | null;
          created_at: string;
          ends_at: string | null;
          external_key: string | null;
          id: number;
          notes: string | null;
          primary_orchestra_id: number | null;
          season: string;
          slug: string;
          source_url: string | null;
          starts_at: string;
          status: string;
          subtitle: string | null;
          ticket_url: string | null;
          title: string;
          updated_at: string;
          venue_id: number;
        };
        Insert: {
          conductor_id?: number | null;
          created_at?: string;
          ends_at?: string | null;
          external_key?: string | null;
          id?: never;
          notes?: string | null;
          primary_orchestra_id?: number | null;
          season?: string;
          slug: string;
          source_url?: string | null;
          starts_at: string;
          status?: string;
          subtitle?: string | null;
          ticket_url?: string | null;
          title: string;
          updated_at?: string;
          venue_id: number;
        };
        Update: {
          conductor_id?: number | null;
          created_at?: string;
          ends_at?: string | null;
          external_key?: string | null;
          id?: never;
          notes?: string | null;
          primary_orchestra_id?: number | null;
          season?: string;
          slug?: string;
          source_url?: string | null;
          starts_at?: string;
          status?: string;
          subtitle?: string | null;
          ticket_url?: string | null;
          title?: string;
          updated_at?: string;
          venue_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "concert_events_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      performers: {
        Row: {
          avatar_url: string | null;
          calendar_url: string | null;
          created_at: string;
          home_city: string | null;
          id: number;
          instrument_or_role: string | null;
          is_featured: boolean;
          last_synced_at: string | null;
          name: string;
          nationality: string | null;
          performer_type: string;
          resident_venue_id: number | null;
          short_bio: string | null;
          slug: string;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          calendar_url?: string | null;
          created_at?: string;
          home_city?: string | null;
          id?: never;
          instrument_or_role?: string | null;
          is_featured?: boolean;
          last_synced_at?: string | null;
          name: string;
          nationality?: string | null;
          performer_type: string;
          resident_venue_id?: number | null;
          short_bio?: string | null;
          slug: string;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          calendar_url?: string | null;
          created_at?: string;
          home_city?: string | null;
          id?: never;
          instrument_or_role?: string | null;
          is_featured?: boolean;
          last_synced_at?: string | null;
          name?: string;
          nationality?: string | null;
          performer_type?: string;
          resident_venue_id?: number | null;
          short_bio?: string | null;
          slug?: string;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      venues: {
        Row: {
          address: string | null;
          architect_or_acoustics: string | null;
          calendar_url: string | null;
          capacity: number | null;
          city: string;
          country: string;
          country_code: string | null;
          created_at: string;
          description: string | null;
          id: number;
          latitude: number;
          longitude: number;
          name: string;
          opened_year: number | null;
          photo_url: string | null;
          short_name: string | null;
          slug: string;
          updated_at: string;
          website_url: string | null;
        };
        Insert: {
          address?: string | null;
          architect_or_acoustics?: string | null;
          calendar_url?: string | null;
          capacity?: number | null;
          city: string;
          country: string;
          country_code?: string | null;
          created_at?: string;
          description?: string | null;
          id?: never;
          latitude: number;
          longitude: number;
          name: string;
          opened_year?: number | null;
          photo_url?: string | null;
          short_name?: string | null;
          slug: string;
          updated_at?: string;
          website_url?: string | null;
        };
        Update: {
          address?: string | null;
          architect_or_acoustics?: string | null;
          calendar_url?: string | null;
          capacity?: number | null;
          city?: string;
          country?: string;
          country_code?: string | null;
          created_at?: string;
          description?: string | null;
          id?: never;
          latitude?: number;
          longitude?: number;
          name?: string;
          opened_year?: number | null;
          photo_url?: string | null;
          short_name?: string | null;
          slug?: string;
          updated_at?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      composer_relations: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          relation_type: string;
          source_composer_id: number;
          strength: number;
          target_composer_id: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: never;
          relation_type: string;
          source_composer_id: number;
          strength?: number;
          target_composer_id: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: never;
          relation_type?: string;
          source_composer_id?: number;
          strength?: number;
          target_composer_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "composer_relations_source_composer_id_fkey";
            columns: ["source_composer_id"];
            isOneToOne: false;
            referencedRelation: "composers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "composer_relations_target_composer_id_fkey";
            columns: ["target_composer_id"];
            isOneToOne: false;
            referencedRelation: "composers";
            referencedColumns: ["id"];
          },
        ];
      };
      composers: {
        Row: {
          avatar_url: string | null;
          birth_place: string | null;
          birth_year: number;
          created_at: string;
          death_year: number | null;
          era: string;
          full_name: string;
          id: number;
          imslp_synced_at: string | null;
          imslp_url: string | null;
          name: string;
          nationality: string;
          notable_for: string | null;
          rank_order: number | null;
          search_vector: unknown;
          short_bio: string;
          slug: string;
          sort_name: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          birth_place?: string | null;
          birth_year: number;
          created_at?: string;
          death_year?: number | null;
          era: string;
          full_name: string;
          id?: never;
          imslp_synced_at?: string | null;
          imslp_url?: string | null;
          name: string;
          nationality: string;
          notable_for?: string | null;
          rank_order?: number | null;
          search_vector?: unknown;
          short_bio: string;
          slug: string;
          sort_name: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          birth_place?: string | null;
          birth_year?: number;
          created_at?: string;
          death_year?: number | null;
          era?: string;
          full_name?: string;
          id?: never;
          imslp_synced_at?: string | null;
          imslp_url?: string | null;
          name?: string;
          nationality?: string;
          notable_for?: string | null;
          rank_order?: number | null;
          search_vector?: unknown;
          short_bio?: string;
          slug?: string;
          sort_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      practice_sessions: {
        Row: {
          created_at: string;
          duration_minutes: number;
          focus_notes: string | null;
          id: number;
          practiced_on: string;
          user_id: string;
          work_id: number;
        };
        Insert: {
          created_at?: string;
          duration_minutes: number;
          focus_notes?: string | null;
          id?: never;
          practiced_on?: string;
          user_id?: string;
          work_id: number;
        };
        Update: {
          created_at?: string;
          duration_minutes?: number;
          focus_notes?: string | null;
          id?: never;
          practiced_on?: string;
          user_id?: string;
          work_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "practice_sessions_work_id_fkey";
            columns: ["work_id"];
            isOneToOne: false;
            referencedRelation: "works";
            referencedColumns: ["id"];
          },
        ];
      };
      recital_program_items: {
        Row: {
          created_at: string;
          custom_duration_minutes: number | null;
          half: number;
          id: number;
          position: number;
          program_id: number;
          program_note: string | null;
          user_id: string;
          work_id: number;
        };
        Insert: {
          created_at?: string;
          custom_duration_minutes?: number | null;
          half?: number;
          id?: never;
          position?: number;
          program_id: number;
          program_note?: string | null;
          user_id?: string;
          work_id: number;
        };
        Update: {
          created_at?: string;
          custom_duration_minutes?: number | null;
          half?: number;
          id?: never;
          position?: number;
          program_id?: number;
          program_note?: string | null;
          user_id?: string;
          work_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recital_program_items_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "recital_programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recital_program_items_work_id_fkey";
            columns: ["work_id"];
            isOneToOne: false;
            referencedRelation: "works";
            referencedColumns: ["id"];
          },
        ];
      };
      recital_programs: {
        Row: {
          created_at: string;
          event_date: string | null;
          id: number;
          intermission_minutes: number;
          is_public: boolean;
          notes: string | null;
          performer_name: string | null;
          share_slug: string | null;
          title: string;
          updated_at: string;
          user_id: string;
          venue: string | null;
        };
        Insert: {
          created_at?: string;
          event_date?: string | null;
          id?: never;
          intermission_minutes?: number;
          is_public?: boolean;
          notes?: string | null;
          performer_name?: string | null;
          share_slug?: string | null;
          title: string;
          updated_at?: string;
          user_id?: string;
          venue?: string | null;
        };
        Update: {
          created_at?: string;
          event_date?: string | null;
          id?: never;
          intermission_minutes?: number;
          is_public?: boolean;
          notes?: string | null;
          performer_name?: string | null;
          share_slug?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          venue?: string | null;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          footer_note: string;
          hero_badge: string;
          hero_subtitle: string;
          hero_title: string;
          id: number;
          site_name: string;
          site_tagline: string;
          updated_at: string;
        };
        Insert: {
          footer_note?: string;
          hero_badge?: string;
          hero_subtitle?: string;
          hero_title?: string;
          id?: number;
          site_name?: string;
          site_tagline?: string;
          updated_at?: string;
        };
        Update: {
          footer_note?: string;
          hero_badge?: string;
          hero_subtitle?: string;
          hero_title?: string;
          id?: number;
          site_name?: string;
          site_tagline?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_repertoire: {
        Row: {
          created_at: string;
          difficulty: number | null;
          id: number;
          last_practiced_at: string | null;
          notes: string | null;
          status: string;
          updated_at: string;
          user_id: string;
          work_id: number;
        };
        Insert: {
          created_at?: string;
          difficulty?: number | null;
          id?: never;
          last_practiced_at?: string | null;
          notes?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          work_id: number;
        };
        Update: {
          created_at?: string;
          difficulty?: number | null;
          id?: never;
          last_practiced_at?: string | null;
          notes?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          work_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "user_repertoire_work_id_fkey";
            columns: ["work_id"];
            isOneToOne: false;
            referencedRelation: "works";
            referencedColumns: ["id"];
          },
        ];
      };
      work_edition_votes: {
        Row: {
          created_at: string;
          id: number;
          item_key: string;
          item_type: string;
          user_id: string;
          work_id: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
          item_key: string;
          item_type: string;
          user_id?: string;
          work_id: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          item_key?: string;
          item_type?: string;
          user_id?: string;
          work_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_edition_votes_work_id_fkey";
            columns: ["work_id"];
            isOneToOne: false;
            referencedRelation: "works";
            referencedColumns: ["id"];
          },
        ];
      };
      work_movements: {
        Row: {
          created_at: string;
          duration_seconds: number | null;
          id: number;
          key_signature: string | null;
          movement_number: number;
          tempo_marking: string | null;
          title: string;
          work_id: number;
        };
        Insert: {
          created_at?: string;
          duration_seconds?: number | null;
          id?: never;
          key_signature?: string | null;
          movement_number: number;
          tempo_marking?: string | null;
          title: string;
          work_id: number;
        };
        Update: {
          created_at?: string;
          duration_seconds?: number | null;
          id?: never;
          key_signature?: string | null;
          movement_number?: number;
          tempo_marking?: string | null;
          title?: string;
          work_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_movements_work_id_fkey";
            columns: ["work_id"];
            isOneToOne: false;
            referencedRelation: "works";
            referencedColumns: ["id"];
          },
        ];
      };
      works: {
        Row: {
          apple_music_url: string | null;
          catalog_display: string | null;
          catalog_number: string | null;
          catalog_system: string | null;
          composer_id: number;
          created_at: string;
          description: string | null;
          duration_minutes: number | null;
          genre: string;
          id: number;
          imslp_synced_at: string | null;
          imslp_url: string | null;
          instrumentation: string | null;
          is_popular: boolean;
          key_signature: string | null;
          movements_count: number | null;
          nickname: string | null;
          recording_notes: string | null;
          search_vector: unknown;
          slug: string | null;
          spotify_url: string | null;
          title: string;
          year_composed: number | null;
          youtube_url: string | null;
        };
        Insert: {
          apple_music_url?: string | null;
          catalog_display?: string | null;
          catalog_number?: string | null;
          catalog_system?: string | null;
          composer_id: number;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number | null;
          genre: string;
          id?: never;
          imslp_synced_at?: string | null;
          imslp_url?: string | null;
          instrumentation?: string | null;
          is_popular?: boolean;
          key_signature?: string | null;
          movements_count?: number | null;
          nickname?: string | null;
          recording_notes?: string | null;
          search_vector?: unknown;
          slug?: string | null;
          spotify_url?: string | null;
          title: string;
          year_composed?: number | null;
          youtube_url?: string | null;
        };
        Update: {
          apple_music_url?: string | null;
          catalog_display?: string | null;
          catalog_number?: string | null;
          catalog_system?: string | null;
          composer_id?: number;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number | null;
          genre?: string;
          id?: never;
          imslp_synced_at?: string | null;
          imslp_url?: string | null;
          instrumentation?: string | null;
          is_popular?: boolean;
          key_signature?: string | null;
          movements_count?: number | null;
          nickname?: string | null;
          recording_notes?: string | null;
          search_vector?: unknown;
          slug?: string | null;
          spotify_url?: string | null;
          title?: string;
          year_composed?: number | null;
          youtube_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "works_composer_id_fkey";
            columns: ["composer_id"];
            isOneToOne: false;
            referencedRelation: "composers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_explore_aggregates: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      submit_catalog_suggestion: {
        Args: { payload: Json };
        Returns: Json;
      };
      search_catalog: {
        Args: {
          era_filter?: string;
          genre_filter?: string;
          max_results?: number;
          query_text: string;
        };
        Returns: {
          avatar_url: string | null;
          catalog_display: string | null;
          composer_id: number;
          composer_name: string;
          composer_slug: string;
          era: string;
          genre: string | null;
          id: number;
          result_type: string;
          score: number;
          slug: string;
          subtitle: string | null;
          title: string;
          year_value: number | null;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Composer = Database["public"]["Tables"]["composers"]["Row"];
export type Work = Database["public"]["Tables"]["works"]["Row"];
export type WorkMovement =
  Database["public"]["Tables"]["work_movements"]["Row"];
export type ComposerRelation =
  Database["public"]["Tables"]["composer_relations"]["Row"];
export type SiteSettings =
  Database["public"]["Tables"]["site_settings"]["Row"];
export type UserRepertoire =
  Database["public"]["Tables"]["user_repertoire"]["Row"];
export type PracticeSession =
  Database["public"]["Tables"]["practice_sessions"]["Row"];
export type RecitalProgram =
  Database["public"]["Tables"]["recital_programs"]["Row"];
export type RecitalProgramItem =
  Database["public"]["Tables"]["recital_program_items"]["Row"];
export type SearchCatalogResult =
  Database["public"]["Functions"]["search_catalog"]["Returns"][number];

export type ComposerWithWorkCount = Composer & {
  works: { count: number }[];
};

export type WorkWithComposer = Work & {
  composers: Pick<Composer, "id" | "name" | "slug" | "era" | "nationality" | "avatar_url"> | null;
};

export type Venue = Database["public"]["Tables"]["venues"]["Row"];
export type Performer = Database["public"]["Tables"]["performers"]["Row"];
export type ConcertEvent = Database["public"]["Tables"]["concert_events"]["Row"];
export type ConcertEventPerformer =
  Database["public"]["Tables"]["concert_event_performers"]["Row"];
export type ConcertEventWork =
  Database["public"]["Tables"]["concert_event_works"]["Row"];
export type CatalogSuggestion =
  Database["public"]["Tables"]["catalog_suggestions"]["Row"];
