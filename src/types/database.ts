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
